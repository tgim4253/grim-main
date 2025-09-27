use crate::bootstrap;
use crate::config::file::IntegrityCheckResult;
use crate::db::repository::connection_repository::ConnectionRepository;
use crate::db::repository::file_repository::FileRepository;
use crate::db::repository::node_repository::NodeRepository;
use crate::models::file::FileInfo;
use crate::models::node::{NodeKind, NodeWithConnections};
use crate::services::db::DB_MANAGER;
use crate::services::file_service::folder::sync_virtual_folder;
use crate::services::storage_root::enumerate_mounted_root;
use crate::services::{db, integrity, moa_services};
use crate::utils::date::get_now_date;
use crate::utils::identifier::get_unique_id;
use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use tauri::{Emitter, State};
use tokio::{
    fs,
    sync::{watch, Mutex, RwLock},
    time::{interval, Duration},
};
use tracing::{error, info, warn};

/// Progress payload emitted to the renderer while bootstrapping a workspace.
#[derive(Clone, Serialize)]
struct ProgressEvent {
    /// Current pipeline stage ("Migrating", "RefreshingMounts", etc.).
    stage: Stage,
    /// Percentage completion (best-effort approximation).
    percent: u8,
    /// Optional human-readable note describing the action.
    note: Option<String>,
}

/// Individual stages that compose the bootstrap pipeline.
#[derive(Clone, Serialize, Default)]
pub enum Stage {
    /// Running database migrations to ensure schema compatibility.
    Migrating,
    /// Refreshing mounted storage roots to detect availability changes.
    RefreshingMounts,
    /// Resolving anchor metadata and related relationships.
    ResolvingAnchors,
    /// Performing the initial filesystem scan after bootstrap.
    InitialScan,

    #[default]
    /// Bootstrap has completed successfully.
    Ready,
    /// Bootstrap failed with an unrecoverable error.
    Error,
}

/// High-level bootstrap status shared with the renderer.
#[derive(Clone, Default, Serialize)]
pub struct AppStatus {
    /// Current stage in the bootstrap pipeline.
    stage: Stage,
    /// Percentage completion for the stage.
    percent: u8,
    /// Most recent error message, if any.
    last_error: Option<String>,
}

/// Application state shared across bootstrap invocations.
#[derive(Default, Clone)]
pub struct AppState {
    /// Cached bootstrap status keyed by Moa identifier.
    pub statuses: Arc<RwLock<HashMap<String, Arc<Mutex<AppStatus>>>>>,
    /// Active filesystem monitor senders keyed by Moa identifier.
    pub watchers: Arc<RwLock<HashMap<String, watch::Sender<bool>>>>,
}

impl AppState {
    /// Fetch an existing bootstrap status for the given Moa id or insert a new entry.
    pub async fn get_or_insert_status(
        &self,
        moa_id: &str,
    ) -> Arc<Mutex<AppStatus>> {
        {
            let rd = self.statuses.read().await;
            if let Some(s) = rd.get(moa_id) {
                return s.clone();
            }
        }
        let mut wr = self.statuses.write().await;
        if let Some(s) = wr.get(moa_id) {
            return s.clone();
        }
        let s = Arc::new(Mutex::new(AppStatus::default()));
        wr.insert(moa_id.to_string(), s.clone());
        s
    }
}

/// Spawn the asynchronous bootstrap pipeline for a given Moa workspace.
pub async fn bootstrap_moa_service(
    app_handle: &tauri::AppHandle,
    state: &State<'_, AppState>,
    moa_id: String,
) -> Result<()> {
    let app_handle = app_handle.clone();
    let state = state.inner().clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = run_bootstrap_pipeline(
            app_handle.clone(),
            state.clone(),
            moa_id.clone(),
        )
        .await
        {
            error!("Bootstrap failed: {}", e);
            set_status(&state, &moa_id, Stage::Error, 0, Some(e.to_string()))
                .await;
            emit(
                &app_handle,
                &moa_id,
                ProgressEvent {
                    stage: Stage::Error,
                    percent: 0,
                    note: Some(format!("Bootstrap failed {}", e).into()),
                },
            );
        }
    });
    Ok(())
}

/// Execute the bootstrap pipeline sequentially while updating progress.
async fn run_bootstrap_pipeline(
    app: tauri::AppHandle,
    state: AppState,
    moa_id: String,
) -> anyhow::Result<()> {
    let t0 = Instant::now();
    step(
        &app,
        &state,
        &moa_id,
        Stage::Migrating,
        0,
        Some("Applying DB migrations"),
    )
    .await;
    apply_migrations(&moa_id).await?;
    info!("Migrating took: {:?} ms", t0.elapsed().as_millis());

    let t1 = Instant::now();
    step(
        &app,
        &state,
        &moa_id,
        Stage::RefreshingMounts,
        15,
        Some("Enumerating volumes"),
    )
    .await;
    ensure_mounted_volume(&moa_id).await?;
    info!("RefreshingMounts took: {:?} ms", t1.elapsed().as_millis());

    step(&app, &state, &moa_id, Stage::ResolvingAnchors, 40, None).await;

    step(&app, &state, &moa_id, Stage::InitialScan, 60, Some("Indexing files"))
        .await;

    let t3 = Instant::now();

    perform_initial_scan(&app, &moa_id).await?;

    info!("Indexing files: {:?} ms", t3.elapsed().as_millis());

    step(&app, &state, &moa_id, Stage::Ready, 100, Some("Done")).await;

    ensure_mount_watchers(&app, &state, &moa_id).await?;

    Ok(())
}

/// Update status for the provided stage and emit a progress event.
async fn step(
    app_handle: &tauri::AppHandle,
    state: &AppState,
    moa_id: &str,
    stage: Stage,
    pct: u8,
    note: Option<&str>,
) {
    set_status(state, moa_id, stage.clone(), pct, note.map(|s| s.to_string()))
        .await;
    emit(
        app_handle,
        moa_id,
        ProgressEvent {
            stage: stage.clone(),
            percent: pct,
            note: note.map(|s| s.to_string()),
        },
    );
}

/// Persist the current progress into shared state if it has advanced.
async fn set_status(
    state: &AppState,
    moa_id: &str,
    stage: Stage,
    percent: u8,
    note: Option<String>,
) {
    let st = state.get_or_insert_status(&moa_id).await;
    let mut st = st.lock().await;
    if percent > st.percent {
        st.stage = stage;
        st.percent = percent;
        st.last_error = note;
    }
}

/// Emit a serialized progress event to the renderer.
fn emit(
    app_handle: &tauri::AppHandle,
    moa_id: &str,
    payload: impl Serialize + Clone,
) {
    let topic = format!("bootstrap://progress/{}", moa_id);
    let _ = app_handle.emit(&topic, payload);
}

/// Perform a lightweight filesystem scan to record mount health and optionally sync.
async fn perform_initial_scan(
    app: &tauri::AppHandle,
    moa_id: &str,
) -> Result<()> {
    #[derive(sqlx::FromRow)]
    struct MountRow {
        virtual_node_id: String,
        real_folder_id: String,
        sync_enabled: i64,
        abs_path: Option<String>,
        stored_mtime: i64,
        include_blob: Option<String>,
        exclude_blob: Option<String>,
    }

    let scan_id = get_unique_id();
    let now = get_now_date();

    {
        let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;
        sqlx::query(
            r#"
            INSERT INTO scan_session (id, started_at)
            VALUES (?, ?)
            "#,
        )
        .bind(&scan_id)
        .bind(&now)
        .execute(tx.as_mut())
        .await?;
        tx.commit().await?;
    }

    let mounts = {
        let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;
        let mounts = FileRepository::fetch_mounts_rows(tx.as_mut()).await?;
        tx.commit().await?;
        mounts
    };

    for mount in mounts {
        let mut status = IntegrityCheckResult::Success;
        let mut error_msg: Option<String> = None;
        let mut current_mtime = mount.stored_mtime;
        if let Some(path) = mount.abs_path.as_ref() {
            let pb = PathBuf::from(path);

            // let extension_filter = ExtensionFilter::new(
            //     &mount.include_extensions,
            //     &mount.exclude_extensions,
            // );

            match fs::metadata(&pb).await {
                Ok(meta) => {
                    current_mtime = FileInfo::file_mtime_epoch(&meta)?;
                    if current_mtime != mount.stored_mtime {
                        status = IntegrityCheckResult::Mismatch;
                        error_msg =
                            Some("Detected filesystem changes".to_string());

                        if mount.sync_enabled {
                            match sync_virtual_folder(
                                app,
                                moa_id,
                                &mount.virtual_node_id,
                            )
                            .await
                            {
                                Ok(()) => {
                                    if let Ok(meta) = fs::metadata(&pb).await {
                                        current_mtime =
                                            FileInfo::file_mtime_epoch(&meta)?;
                                    }
                                    status = IntegrityCheckResult::Success;
                                    error_msg = None;
                                }
                                Err(sync_err) => {
                                    error_msg = Some(format!(
                                        "Sync failed: {}",
                                        sync_err,
                                    ));
                                }
                            }
                        }
                    }
                }
                Err(err) => {
                    status = IntegrityCheckResult::NotFound;
                    error_msg = Some(err.to_string());
                }
            }
        } else {
            status = IntegrityCheckResult::NotFound;
            error_msg =
                Some("Missing cached path for mounted folder".to_string());
        }

        let mut update_tx = DB_MANAGER.create_new_tx(moa_id).await?;
        sqlx::query(
            r#"
            UPDATE real_folder
               SET error_flag = ?,
                   error_msg = ?,
                   last_seen_scan_id = ?,
                   last_seen_at = ?,
                   updated_at = ?
             WHERE id = ?
            "#,
        )
        .bind(match status {
            IntegrityCheckResult::NotFound => "notfound",
            IntegrityCheckResult::Mismatch => "mismatch",
            IntegrityCheckResult::Success => "success",
        })
        .bind(&error_msg)
        .bind(&scan_id)
        .bind(&now)
        .bind(&now)
        .bind(&mount.real_folder_id)
        .execute(update_tx.as_mut())
        .await?;

        if status == IntegrityCheckResult::Success {
            sqlx::query(
                r#"
                UPDATE real_folder
                   SET mtime = ?
                 WHERE id = ?
                "#,
            )
            .bind(current_mtime)
            .bind(&mount.real_folder_id)
            .execute(update_tx.as_mut())
            .await?;
        }

        update_tx.commit().await?;
    }

    {
        let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;
        let finished = get_now_date();
        sqlx::query(
            r#"
            UPDATE scan_session
               SET finished_at = ?
             WHERE id = ?
            "#,
        )
        .bind(&finished)
        .bind(&scan_id)
        .execute(tx.as_mut())
        .await?;
        tx.commit().await?;
    }

    Ok(())
}

async fn ensure_mount_watchers(
    app: &tauri::AppHandle,
    state: &AppState,
    moa_id: &str,
) -> Result<()> {
    {
        let existing = state.watchers.read().await;
        if existing.contains_key(moa_id) {
            return Ok(());
        }
    }

    let (tx, rx) = watch::channel(false);
    let app_handle = app.clone();
    let moa_id_owned = moa_id.to_string();

    tauri::async_runtime::spawn(async move {
        run_mount_watch_loop(app_handle, moa_id_owned, rx).await;
    });

    let mut guard = state.watchers.write().await;
    guard.insert(moa_id.to_string(), tx);
    Ok(())
}

async fn run_mount_watch_loop(
    app: tauri::AppHandle,
    moa_id: String,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    if let Err(err) = detect_mount_changes(&app, &moa_id).await {
        warn!("Initial mount scan failed for {moa_id}: {err}");
    }

    let mut ticker = interval(Duration::from_secs(15));
    loop {
        tokio::select! {
            changed = shutdown_rx.changed() => {
                match changed {
                    Ok(_) => {
                        if *shutdown_rx.borrow() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }
            _ = ticker.tick() => {
                if let Err(err) = detect_mount_changes(&app, &moa_id).await {
                    warn!("Mount monitor tick failed for {moa_id}: {err}");
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderStatusEvent {
    virtual_node_ids: Vec<String>,
}

async fn detect_mount_changes(
    app: &tauri::AppHandle,
    moa_id: &str,
) -> Result<()> {
    let mounts = {
        let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;
        let mounts = FileRepository::fetch_mounts_rows(tx.as_mut()).await?;
        tx.commit().await?;
        mounts
    };

    if mounts.is_empty() {
        return Ok(());
    }

    let mut changed: Vec<String> = Vec::new();

    for mount in mounts {
        let Some(abs_path) = mount.abs_path.clone() else {
            let updated = update_real_folder_status(
                moa_id,
                &mount.real_folder_id,
                IntegrityCheckResult::NotFound,
                Some("Missing cached path for mounted folder".to_string()),
            )
            .await?;
            if updated {
                changed.push(mount.virtual_node_id.clone());
            }
            continue;
        };

        let path = PathBuf::from(&abs_path);
        match fs::metadata(&path).await {
            Ok(meta) => {
                let current_mtime = FileInfo::file_mtime_epoch(&meta)?;
                println!(
                    "{}: {} vs {}",
                    path.display(),
                    current_mtime,
                    mount.stored_mtime
                );
                if current_mtime != mount.stored_mtime {
                    if mount.sync_enabled {
                        match sync_virtual_folder(
                            app,
                            moa_id,
                            &mount.virtual_node_id,
                        )
                        .await
                        {
                            Ok(()) => {
                                changed.push(mount.virtual_node_id.clone());
                            }
                            Err(err) => {
                                warn!(
                                    "Auto-sync failed for {} ({}): {}",
                                    mount.virtual_node_id,
                                    path.display(),
                                    err
                                );
                                let updated = update_real_folder_status(
                                    moa_id,
                                    &mount.real_folder_id,
                                    IntegrityCheckResult::Mismatch,
                                    Some(format!("Sync failed: {err}")),
                                )
                                .await?;
                                if updated {
                                    changed.push(mount.virtual_node_id.clone());
                                }
                            }
                        }
                    } else {
                        let updated = update_real_folder_status(
                            moa_id,
                            &mount.real_folder_id,
                            IntegrityCheckResult::Mismatch,
                            Some("Detected filesystem changes".to_string()),
                        )
                        .await?;
                        if updated {
                            changed.push(mount.virtual_node_id.clone());
                        }
                    }
                } else {
                    let updated = update_real_folder_status(
                        moa_id,
                        &mount.real_folder_id,
                        IntegrityCheckResult::Success,
                        None,
                    )
                    .await?;
                    if updated {
                        changed.push(mount.virtual_node_id.clone());
                    }
                }
            }
            Err(err) => {
                warn!(
                    "Failed to read metadata for {} ({}): {}",
                    mount.virtual_node_id,
                    path.display(),
                    err
                );
                let updated = update_real_folder_status(
                    moa_id,
                    &mount.real_folder_id,
                    IntegrityCheckResult::NotFound,
                    Some(err.to_string()),
                )
                .await?;
                if updated {
                    changed.push(mount.virtual_node_id.clone());
                }
            }
        }
    }

    if !changed.is_empty() {
        changed.sort();
        changed.dedup();
        let payload = FolderStatusEvent { virtual_node_ids: changed };
        let _ = app.emit(&format!("folder-status://changed/{moa_id}"), payload);
    }

    Ok(())
}

async fn update_real_folder_status(
    moa_id: &str,
    real_folder_id: &str,
    status: IntegrityCheckResult,
    error_msg: Option<String>,
) -> Result<bool> {
    let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;
    let now = get_now_date();
    let status_str = match status {
        IntegrityCheckResult::Success => "success",
        IntegrityCheckResult::Mismatch => "mismatch",
        IntegrityCheckResult::NotFound => "notfound",
    };

    let error_msg_ref = error_msg.as_deref();

    let rows = sqlx::query(
        r#"
        UPDATE real_folder
           SET error_flag = ?2,
               error_msg = ?3,
               last_seen_at = ?4,
               updated_at = ?4
         WHERE id = ?1
           AND (error_flag IS NULL OR error_flag != ?2 OR COALESCE(error_msg, '') != COALESCE(?3, ''))
        "#,
    )
    .bind(real_folder_id)
    .bind(status_str)
    .bind(error_msg_ref)
    .bind(&now)
    .execute(tx.as_mut())
    .await?
    .rows_affected();

    tx.commit().await?;

    Ok(rows > 0)
}

/// Fetch the initial node graph needed by the renderer after bootstrap.
pub async fn fetch_init_data_for_front(
    moa_id: String,
) -> Result<NodeWithConnections> {
    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let folder_and_files = NodeRepository::fetch_all_nodes_by_kind(
        tx.as_mut(),
        HashSet::from([NodeKind::Folder, NodeKind::File]),
    )
    .await?;
    let connections = ConnectionRepository::fetch_connections(
        tx.as_mut(),
        folder_and_files.iter().map(|f| f.id.clone()).collect(),
    )
    .await?;

    tx.commit().await?;

    Ok(NodeWithConnections { nodes: folder_and_files, connections })
}

/// Ensure the workspace database is created and migrated before use.
async fn apply_migrations(moa_id: &str) -> Result<()> {
    let moa =
        moa_services::MOA_DATA.read().unwrap().get_by_id(&moa_id).unwrap();

    let name = moa.name;
    let path = moa.path;

    let base = bootstrap::build_paths(&path, &name);
    if !base.exists() || !base.is_dir() {
        return Err(anyhow!("Moa Base Folder not found"));
    }

    let _ =
        bootstrap::ensure_layout(&base).await.context("Failed to prepare .moa");

    let pool = db::DB_MANAGER.get_or_open(&moa_id).await?;

    integrity::ensure_schema(&pool).await.map_err(|e| {
        anyhow::anyhow!("Failed to ensure database schema: {}", e)
    })?;

    integrity::seed_initial_data(&pool)
        .await
        .context("Failed to seed initial database data")?;
    Ok(())
}

/// Mark mounted storage roots as available and update cached metadata.
async fn ensure_mounted_volume(moa_id: &str) -> Result<()> {
    let mounted = enumerate_mounted_root()?;

    let pool = DB_MANAGER.get_or_open(&moa_id).await?;
    let mut tx = pool.begin().await?;

    sqlx::query(
        r#"
        UPDATE storage_root SET
            is_available = FALSE"#,
    )
    .execute(&mut *tx)
    .await?;

    let mut roots_changed: HashSet<String> = HashSet::new();

    for m in mounted {
        let now_s = get_now_date();
        // match by stable_id and platform
        let root_id: Option<String> = sqlx::query_scalar(
            r#"
            SELECT id
            FROM storage_root
            WHERE platform = $1 AND stable_id = $2
            "#,
        )
        .bind(&m.platform)
        .bind(&m.stable_id)
        .fetch_optional(&mut *tx)
        .await?;

        let Some(rid) = root_id else {
            continue;
        };
        // Check previous availability & primary mount to detect change
        #[derive(sqlx::FromRow)]
        struct PrevState {
            is_available: bool,
            primary_mount: Option<String>,
        }
        let prev: PrevState = sqlx::query_as(
            r#"
            SELECT
              sr.is_available,
              (SELECT sm.mount_path
                 FROM storage_root_mount sm
                WHERE sm.storage_root_id = sr.id AND sm.is_primary = TRUE
                LIMIT 1) AS primary_mount
            FROM storage_root sr
            WHERE sr.id = $1
            "#,
        )
        .bind(&rid)
        .fetch_one(&mut *tx)
        .await?;

        // mark available + update updated_at, secondary_id, ()
        let updated = sqlx::query(
            r#"
            UPDATE storage_root
               SET is_available = TRUE,
                   secondary_id = $3,
                   updated_at   = $2
             WHERE id = $1
            "#,
        )
        .bind(&rid)
        .bind(&now_s)
        .bind(&m.secondary_id)
        .execute(&mut *tx)
        .await?;

        // if 0, no records found
        if updated.rows_affected() > 0 {
            roots_changed.insert(rid.clone());
        }

        // upsert mount_path as primary
        // Requires a unique constraint on (storage_root_id, mount_path).
        sqlx::query(
            r#"
            INSERT INTO storage_root_mount (id, storage_root_id, mount_path, is_primary, created_at, updated_at)
            VALUES ($4, $1, $2, TRUE, $3, $3)
            ON CONFLICT (storage_root_id, mount_path)
            DO UPDATE SET
                id = EXCLUDED.id, 
                is_primary = EXCLUDED.is_primary,
                updated_at = $3
            "#,
        )
        .bind(&rid)
        .bind(&m.mount_path)
        .bind(&now_s)
        .bind(get_unique_id())
        .execute(&mut *tx)
        .await?;

        // set all other mount paths of this root is_primary=FALSE
        let demote = sqlx::query(
            r#"
            UPDATE storage_root_mount
               SET is_primary = CASE WHEN mount_path = $2 THEN TRUE ELSE FALSE END,
                   updated_at = $3
             WHERE storage_root_id = $1
            "#,
        )
        .bind(&rid)
        .bind(&m.mount_path)
        .bind(&now_s)
        .execute(&mut *tx)
        .await?;

        if demote.rows_affected() > 0 {
            // If primary changed compared to previous primary, mark changed
            if prev.primary_mount.as_deref() != Some(m.mount_path.as_str()) {
                roots_changed.insert(rid.clone());
            }
        }

        // refresh real_folder.abs_path_cached for this root
        #[cfg(target_os = "macos")]
        sqlx::query(
            r#"
            UPDATE real_folder
               SET abs_path_cached = CASE
                   WHEN root_rel_path IS NULL OR root_rel_path = '' THEN $2
                   ELSE rtrim($2, '/') || '/' || ltrim(root_rel_path, '/')
               END,
                   updated_at = $3
             WHERE storage_root_id = $1
            "#,
        )
        .bind(rid)
        .bind(&m.mount_path)
        .bind(&now_s)
        .execute(&mut *tx)
        .await?;

        #[cfg(windows)]
        sqlx::query(
            r#"
            UPDATE real_folder
                SET abs_path_cached = CASE
                    WHEN root_rel_path IS NULL OR root_rel_path = '' THEN $2
                    ELSE rtrim($2, '\') || '\' || ltrim(root_rel_path, '\')
                END,
                    updated_at = $3
            WHERE storage_root_id = $1
            "#,
        )
        .bind(rid)
        .bind(&m.mount_path)
        .bind(&now_s)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(())
}

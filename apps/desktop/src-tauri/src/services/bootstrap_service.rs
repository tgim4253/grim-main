use crate::bootstrap;
use crate::db::repository::connection_repository::ConnectionRepository;
use crate::db::repository::node_repository::NodeRepository;
use crate::models::file::StorageRootInfo;
use crate::models::graph::GraphResponse;
use crate::models::node::{NodeKind, NodeWithConnections};
use crate::services::db::DB_MANAGER;
use crate::services::storage_root::enumerate_mounted_root;
use crate::services::{db, integrity, moa_services};
use crate::utils::date::get_now_date;
use crate::utils::identifier::{get_unique_id, IdType};
use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::hash::Hash;
use std::sync::Arc;
use std::time::Instant;
use tauri::{Emitter, State};
use tokio::sync::{Mutex, RwLock};

#[derive(Clone, Serialize)]
struct ProgressEvent {
    stage: Stage, // "Migrating", "RefreshingMounts", ...
    percent: u8,  // 0..100 (best-effort)
    note: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub enum Stage {
    Migrating,
    RefreshingMounts,
    ResolvingAnchors,
    InitialScan,

    #[default]
    Ready,
    Error,
}

#[derive(Clone, Default, Serialize)]
pub struct AppStatus {
    stage: Stage,
    percent: u8,
    last_error: Option<String>,
}

#[derive(Default, Clone)]
pub struct AppState {
    pub statuses: Arc<RwLock<HashMap<String, Arc<Mutex<AppStatus>>>>>,
}

impl AppState {
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
    // pub async fn remove(&self, moa_id: &str) {
    //     let mut wr = self.statuses.write().await;
    //     wr.remove(moa_id);
    // }
}

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
            println!("Bootstrap failed: {}", e);
            // set error status
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
    println!("Migrating took: {:?} ms", t0.elapsed().as_millis());

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
    println!("RefreshingMounts took: {:?} ms", t1.elapsed().as_millis());

    step(&app, &state, &moa_id, Stage::ResolvingAnchors, 40, None).await;

    step(&app, &state, &moa_id, Stage::InitialScan, 60, Some("Indexing files"))
        .await;

    step(&app, &state, &moa_id, Stage::Ready, 100, Some("Done")).await;

    Ok(())
}

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

fn emit(
    app_handle: &tauri::AppHandle,
    moa_id: &str,
    payload: impl Serialize + Clone,
) {
    let topic = format!("bootstrap://progress/{}", moa_id);
    let _ = app_handle.emit(&topic, payload);
}

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

    Ok(NodeWithConnections {
        nodes: folder_and_files,
        connections: connections,
    })
}

async fn apply_migrations(moa_id: &str) -> Result<()> {
    let moa =
        moa_services::MOA_DATA.read().unwrap().get_by_id(&moa_id).unwrap();

    let name = moa.name;
    let path = moa.path;

    let base = bootstrap::build_paths(&path, &name);
    if !base.exists() || !base.is_dir() {
        return Err(anyhow!("Moa Base Folder not found"));
    }

    let _ = bootstrap::ensure_layout(&base).context("Failed to prepare .moa");

    let pool = db::DB_MANAGER.get_or_open(&moa_id).await?;

    integrity::ensure_schema(&pool).await.map_err(|e| {
        anyhow::anyhow!("Failed to ensure database schema: {}", e)
    })?;

    integrity::seed_initial_data(&pool)
        .await
        .context("Failed to seed initial database data")?;
    Ok(())
}

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

    // enqueue scan jobs for roots that changed (availability or primary mount)
    for r in roots_changed {
        // Ignore enqueue errors
        // let _ = enqueue_scan_session(r).await;
    }

    Ok(())
}

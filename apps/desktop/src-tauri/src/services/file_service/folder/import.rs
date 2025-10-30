use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
};

use anyhow::{anyhow, bail, Context, Result};
use async_recursion::async_recursion;
use sqlx::{Sqlite, Transaction};
use tauri::AppHandle;
use tokio::{fs, sync::Mutex};
use tracing::warn;

use crate::{
    db::repository::{
        file_repository::{FileRepository, MountUpdateOptions},
        node_repository::NodeRepository,
        sroot_repository::SrootRepository,
    },
    models::{
        connection::RelationType,
        file::{
            FileInfo, FileType, FolderData, FolderOptionUpdatePayload,
            FolderSelection, RealFolderData,
        },
        node::Node,
    },
    services::{
        connection_rules::{
            ensure_connections_for_nodes, load_engine_for_moa,
            ConnectionRuleEngine,
        },
        db::DB_MANAGER,
        file_service::{
            asset::ensure_file_asset_binding,
            job_queue::{enqueue_base_job, BaseThumbnailJob},
        },
        storage_root::{self, ensure_storage_root_and_real_folder},
    },
    utils::{file_utils::file_mtime_epoch, path_utils::normalize_path},
};

use super::{
    metrics::UpsertFolderMetrics,
    progress::ImportProgressTracker,
    selection::{
        derive_root_extension_list, normalize_extension_list,
        relative_path_key, ExtensionFilter, SelectionPlan,
    },
};

use crate::services::file_service::utils::check_is_hidden;

/// Create a new virtual folder inside a transaction.
pub async fn create_folder(moa_id: String, data: FolderData) -> Result<Node> {
    let mut tx: Transaction<'_, Sqlite> =
        DB_MANAGER.create_new_tx(&moa_id).await?;

    let node = FileRepository::create_virtual_folder(
        tx.as_mut(),
        data.name,
        data.parent_id,
    )
    .await?;

    tx.commit().await?;

    Ok(node)
}

/// Mount the first physical folder selected by the user into the virtual tree.
#[allow(clippy::too_many_arguments)]
pub async fn first_mount_folder(
    app: AppHandle,
    moa_id: String,
    node: Node,
    path: String,
    selection: Option<FolderSelection>,
    expected_bytes: Option<u64>,
    expected_files: Option<u64>,
) -> Result<()> {
    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let norm_path = normalize_path(Path::new(&path));

    let selection_plan = selection.map(SelectionPlan::from_selection);
    let include_filters = derive_root_extension_list(selection_plan.as_ref());

    let sroot_info = storage_root::detect_storage_root(&norm_path)?;

    let virtual_folder_id = node.id.clone();
    let real_folder_id =
        ensure_storage_root_and_real_folder(&mut tx, &sroot_info, &norm_path)
            .await?;

    let mount_id = FileRepository::create_virtual_folder_mount(
        tx.as_mut(),
        virtual_folder_id.clone(),
        real_folder_id.clone(),
    )
    .await?;

    if let Some(include_list) = include_filters.as_ref() {
        FileRepository::update_mount_extension_filters(
            tx.as_mut(),
            &mount_id,
            Some(include_list.as_slice()),
            None,
        )
        .await?;
    }

    let progress = Arc::new(Mutex::new(ImportProgressTracker::new(
        app.clone(),
        moa_id.clone(),
        virtual_folder_id.clone(),
        expected_bytes,
        expected_files,
    )));

    {
        let guard = progress.lock().await;
        guard.notify_start();
    }

    let extension_filter = ExtensionFilter::default();

    let upsert_config = FolderUpsertConfig {
        recursive: true,
        make_virtual_folder: Some(true),
        selection: selection_plan.as_ref(),
        root_path: &norm_path,
        extension_filter: &extension_filter,
        progress: Some(progress.clone()),
    };

    let upsert_result = upsert_folder(
        &mut tx,
        &moa_id,
        real_folder_id.clone(),
        virtual_folder_id.clone(),
        &norm_path,
        upsert_config,
    )
    .await;

    match upsert_result {
        Ok(()) => {
            let mut guard = progress.lock().await;
            guard.finish();
        }
        Err(err) => {
            {
                let guard = progress.lock().await;
                guard.fail();
            }
            return Err(err);
        }
    }

    let _scan_id = start_scan_job(moa_id.clone(), real_folder_id).await?;

    tx.commit().await?;

    Ok(())
}

/// Re-run ingestion for an existing virtual folder mount to pull in filesystem changes.
pub async fn sync_virtual_folder(
    _app: &AppHandle,
    moa_id: &str,
    virtual_node_id: &str,
) -> Result<()> {
    let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;

    let mount = FileRepository::fetch_mount_for_virtual_node(
        tx.as_mut(),
        virtual_node_id,
    )
    .await?
    .ok_or_else(|| {
        anyhow!("No mounted real folder for virtual node {virtual_node_id}")
    })?;

    let abs_path = mount.abs_path.ok_or_else(|| {
        anyhow!("Missing cached absolute path for mounted folder")
    })?;
    let abs_path = PathBuf::from(&abs_path);

    if !abs_path.exists() {
        bail!("Mounted folder path {} no longer exists", abs_path.display());
    }

    let metadata = fs::metadata(&abs_path).await.with_context(|| {
        format!(
            "Failed to read metadata for mounted folder {}",
            abs_path.display()
        )
    })?;
    let mtime = FileInfo::file_mtime_epoch(&metadata)?;

    let extension_filter = ExtensionFilter::new(
        &mount.include_extensions,
        &mount.exclude_extensions,
    );

    let upsert_config = FolderUpsertConfig {
        recursive: mount.recursive,
        make_virtual_folder: Some(true),
        selection: None,
        root_path: abs_path.as_path(),
        extension_filter: &extension_filter,
        progress: None,
    };

    upsert_folder(
        &mut tx,
        moa_id,
        mount.real_folder_id.clone(),
        virtual_node_id.to_string(),
        abs_path.as_path(),
        upsert_config,
    )
    .await?;

    let now = crate::utils::date::get_now_date();
    sqlx::query!(
        r#"
        UPDATE real_folder
           SET mtime = ?2,
               error_flag = 'success',
               error_msg = NULL,
               last_seen_at = COALESCE(last_seen_at, ?3),
               updated_at = ?3
         WHERE id = ?1
        "#,
        mount.real_folder_id,
        mtime,
        now
    )
    .execute(tx.as_mut())
    .await?;

    tx.commit().await?;

    Ok(())
}

/// Update mount-level options such as recursion, sync, and associated real-folder path.
pub async fn update_virtual_folder_options(
    moa_id: &str,
    virtual_node_id: &str,
    payload: FolderOptionUpdatePayload,
) -> Result<()> {
    let mount = {
        let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;
        let mount = FileRepository::fetch_mount_for_virtual_node(
            tx.as_mut(),
            virtual_node_id,
        )
        .await?;
        tx.commit().await?;
        mount
    }
    .ok_or_else(|| {
        anyhow!("No mounted real folder for virtual node {virtual_node_id}")
    })?;

    let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;

    let mut new_real_folder_id: Option<String> = None;

    if let Some(path) = payload.path.as_ref().filter(|p| !p.is_empty()) {
        let norm_path = normalize_path(Path::new(path));
        let norm_str = norm_path.to_string_lossy();
        if mount.abs_path.as_deref() != Some(norm_str.as_ref()) {
            let sroot_info = storage_root::detect_storage_root(&norm_path)?;
            let ensured = ensure_storage_root_and_real_folder(
                &mut tx,
                &sroot_info,
                &norm_path,
            )
            .await?;
            new_real_folder_id = Some(ensured);
        }
    }

    let include_extensions =
        payload.include_extensions.map(normalize_extension_list);
    let exclude_extensions =
        payload.exclude_extensions.map(normalize_extension_list);

    FileRepository::update_mount_options(
        tx.as_mut(),
        &mount.mount_id,
        MountUpdateOptions {
            new_real_folder_id: new_real_folder_id.as_deref(),
            recursive: payload.recursive,
            sync_enabled: payload.sync_enabled,
            suppress_warnings: payload.suppress_warnings,
            include_extensions: include_extensions.as_deref(),
            exclude_extensions: exclude_extensions.as_deref(),
        },
    )
    .await?;

    tx.commit().await?;

    Ok(())
}

/// Spawn a background job that scans a real folder.
pub(crate) async fn start_scan_job(
    _moa_id: String,
    _real_folder_id: String,
) -> Result<String> {
    Ok(String::new())
}

#[derive(Clone)]
struct FolderUpsertConfig<'a> {
    recursive: bool,
    make_virtual_folder: Option<bool>,
    selection: Option<&'a SelectionPlan>,
    root_path: &'a Path,
    extension_filter: &'a ExtensionFilter,
    progress: Option<Arc<Mutex<ImportProgressTracker>>>,
}

impl<'a> FolderUpsertConfig<'a> {
    fn with_make_virtual_folder(
        mut self,
        make_virtual_folder: Option<bool>,
    ) -> Self {
        self.make_virtual_folder = make_virtual_folder;
        self
    }
}

struct FileEntryParams<'a> {
    parent_real_folder_id: &'a str,
    parent_virtual_folder_id: &'a str,
    entry: &'a fs::DirEntry,
    allowed_types: Option<&'a HashSet<FileType>>,
}

/// Recursively upsert folder and file information.
async fn upsert_folder(
    tx: &mut Transaction<'_, Sqlite>,
    moa_id: &str,
    parent_real_folder_id: String,
    parent_virtual_folder_id: String,
    abs_dir: &Path,
    config: FolderUpsertConfig<'_>,
) -> Result<()> {
    let mut metrics = UpsertFolderMetrics::default();
    let total_timer = Instant::now();
    let engine = load_engine_for_moa(moa_id).await?;

    upsert_folder_impl(
        tx,
        moa_id,
        parent_real_folder_id,
        parent_virtual_folder_id,
        abs_dir,
        config,
        &engine,
        None,
        &mut metrics,
    )
    .await?;

    metrics.total_elapsed = total_timer.elapsed();
    metrics.log(abs_dir);

    Ok(())
}

/// Internal recursive implementation that accumulates metrics across the traversal.
#[async_recursion]
#[allow(clippy::too_many_arguments)]
async fn upsert_folder_impl(
    tx: &mut Transaction<'_, Sqlite>,
    moa_id: &str,
    parent_real_folder_id: String,
    parent_virtual_folder_id: String,
    abs_dir: &Path,
    config: FolderUpsertConfig<'async_recursion>,
    engine: &ConnectionRuleEngine,
    inherited_allowed_types: Option<HashSet<FileType>>,
    metrics: &mut UpsertFolderMetrics,
) -> Result<()> {
    let make_vf = config.make_virtual_folder.unwrap_or(true);

    let relative_key = relative_path_key(config.root_path, abs_dir);
    let mut current_allowed = inherited_allowed_types;

    if let Some(plan) = config.selection {
        if let Some(node_selection) = plan.get(&relative_key) {
            if !node_selection.include {
                return Ok(());
            }

            if let Some(mut allowed) = node_selection.allowed_types.clone() {
                if let Some(parent_allowed) = current_allowed.as_ref() {
                    allowed =
                        allowed.intersection(parent_allowed).cloned().collect();
                }
                current_allowed = Some(allowed);
            }
        }
    }

    let tree_scan_timer = Instant::now();
    let mut dir = fs::read_dir(abs_dir)
        .await
        .with_context(|| format!("failed to read_dir {:?}", abs_dir))?;

    let mut folder_entries: Vec<(PathBuf, String, Option<HashSet<FileType>>)> =
        Vec::new();
    while let Some(entry) = dir
        .next_entry()
        .await
        .with_context(|| format!("failed to read entry under {:?}", abs_dir))?
    {
        let entry_path: PathBuf = entry.path();

        if check_is_hidden(&entry_path) {
            continue;
        }

        let file_type = entry.file_type().await.with_context(|| {
            format!("failed to get file_type for {:?}", entry_path)
        })?;

        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();

            let mut include_child = true;
            let mut child_allowed = current_allowed.clone();

            if let Some(plan) = config.selection {
                let child_key =
                    relative_path_key(config.root_path, &entry_path);
                if let Some(child_selection) = plan.get(&child_key) {
                    if !child_selection.include {
                        include_child = false;
                    } else if let Some(mut allowed) =
                        child_selection.allowed_types.clone()
                    {
                        if let Some(parent_allowed) = child_allowed.as_ref() {
                            allowed = allowed
                                .intersection(parent_allowed)
                                .cloned()
                                .collect();
                        }
                        child_allowed = Some(allowed);
                    }
                }
            }

            if !include_child {
                continue;
            }

            if config.recursive {
                folder_entries.push((entry_path, name, child_allowed));
            } else if make_vf {
                let folder_timer = Instant::now();
                FileRepository::create_virtual_folder(
                    tx.as_mut(),
                    name,
                    parent_virtual_folder_id.clone(),
                )
                .await
                .with_context(|| {
                    format!("create_virtual_folder failed for {:?}", entry_path)
                })?;
                metrics.record_folder_creation(folder_timer.elapsed());
            }
        } else if file_type.is_file() {
            let params = FileEntryParams {
                parent_real_folder_id: &parent_real_folder_id,
                parent_virtual_folder_id: &parent_virtual_folder_id,
                entry: &entry,
                allowed_types: current_allowed.as_ref(),
            };
            upsert_file_entry(tx, moa_id, params, &config, engine, metrics)
                .await
                .with_context(|| {
                    format!("upsert_file_entry failed for {:?}", entry_path)
                })?;
        }
    }
    metrics.record_tree_scanning(tree_scan_timer.elapsed());

    let sroot_id: String = sqlx::query_scalar(
        "SELECT storage_root_id FROM real_folder\n                     WHERE id = ?",
    )
    .bind(&parent_real_folder_id)
    .fetch_optional(tx.as_mut())
    .await
    .with_context(|| "failed to load storage_root for parent_real_folder_id")?
    .ok_or_else(|| anyhow!("parent_real_folder_id not found: {}", parent_real_folder_id))?;

    if config.recursive {
        for (entry_path, name, child_allowed) in folder_entries {
            let folder_timer = Instant::now();
            let child_vf = FileRepository::create_virtual_folder(
                tx.as_mut(),
                name.clone(),
                parent_virtual_folder_id.clone(),
            )
            .await
            .with_context(|| {
                format!("create_virtual_folder failed for {:?}", entry_path)
            })?;

            let normalized = normalize_path(&entry_path);

            let child_real_folder_id =
                ensure_real_folder(tx, sroot_id.clone(), &normalized).await?;

            FileRepository::create_virtual_folder_mount(
                tx.as_mut(),
                child_vf.id.clone(),
                child_real_folder_id.clone(),
            )
            .await
            .with_context(|| {
                format!("mount vf<->rf failed for {:?}", entry_path)
            })?;
            metrics.record_folder_creation(folder_timer.elapsed());

            let mut child_config =
                config.clone().with_make_virtual_folder(Some(make_vf));
            child_config.progress = config.progress.clone();

            if let Err(e) = upsert_folder_impl(
                tx,
                moa_id,
                child_real_folder_id,
                child_vf.id,
                &entry_path,
                child_config,
                engine,
                child_allowed,
                metrics,
            )
            .await
            {
                warn!("upsert_folder error: {e}");
            };
        }
    }

    Ok(())
}

/// Upsert file metadata and associations for a single discovered entry.
async fn upsert_file_entry(
    tx: &mut Transaction<'_, Sqlite>,
    moa_id: &str,
    params: FileEntryParams<'_>,
    config: &FolderUpsertConfig<'_>,
    engine: &ConnectionRuleEngine,
    metrics: &mut UpsertFolderMetrics,
) -> Result<()> {
    let file_timer = Instant::now();
    let file_path = params.entry.path();
    if !config.extension_filter.allows(file_path.as_path()) {
        return Ok(());
    }
    let kind_guess = FileType::from(file_path.as_path());

    if let Some(allowed) = params.allowed_types {
        if !allowed.contains(&kind_guess) {
            return Ok(());
        }
    }

    let file_name = params.entry.file_name().to_string_lossy().to_string();
    let file_info = FileInfo::new(
        moa_id,
        &file_path,
        params.parent_real_folder_id.to_string(),
        file_name,
    )
    .await?;

    let (asset_id, _) = ensure_file_asset_binding(tx, &file_info).await?;

    let file_node_id =
        NodeRepository::upsert_file_node(tx.as_mut(), asset_id.clone()).await?;

    ensure_connections_for_nodes(
        tx.as_mut(),
        engine,
        params.parent_virtual_folder_id,
        &file_node_id,
        (Some(RelationType::ContainsFile), Some(RelationType::BelongToFolder)),
        None,
        false,
    )
    .await?;

    if file_info.file_exists && file_info.kind_guess == FileType::Image {
        enqueue_base_job(BaseThumbnailJob {
            moa_id: moa_id.to_string(),
            xxhs: file_info.xxh3_64.clone(),
            source_path: file_path.clone(),
        })
        .await;
    }
    metrics.record_upsert_file(file_info.file_size, file_timer.elapsed());

    if let Some(tracker) = &config.progress {
        let mut guard = tracker.lock().await;
        guard.record_file(file_info.file_size);
    }

    Ok(())
}

/// Ensure that a real folder record exists for the provided path.
pub async fn ensure_real_folder(
    tx: &mut Transaction<'_, Sqlite>,
    sroot_id: String,
    norm_path: &PathBuf,
) -> Result<String> {
    let mut current_parent_id: Option<String> = None;

    let mount_path = SrootRepository::fetch_mount_path(tx.as_mut(), &sroot_id)
        .await?
        .ok_or_else(|| anyhow!("Failed to fetch mount path"))?;

    let components_path =
        if let Ok(sub_path) = norm_path.strip_prefix(&mount_path) {
            sub_path
        } else {
            norm_path
        };

    let components: Vec<&str> = if components_path.as_os_str().is_empty() {
        vec![""]
    } else {
        components_path
            .components()
            .filter_map(|c| c.as_os_str().to_str())
            .filter(|s| !s.is_empty())
            .collect()
    };

    let mut rel_path = PathBuf::from("");
    let mut abs_path = PathBuf::from(&mount_path);

    for component in components {
        abs_path.push(component);
        rel_path.push(component);

        let metadata = fs::metadata(&abs_path).await?;
        let mtime = file_mtime_epoch(&metadata)?;

        let data = RealFolderData {
            storage_root_id: Some(sroot_id.to_owned()),
            parent_id: current_parent_id.clone(),
            name: component.to_string(),
            name_norm: component.to_lowercase(),
            root_rel_path: Some(rel_path.to_string_lossy().into_owned()),
            abs_path_cached: Some(abs_path.to_string_lossy().into_owned()),
            mtime,
        };

        let id = FileRepository::upsert_real_folder(tx.as_mut(), &data).await?;
        current_parent_id = Some(id);
    }

    current_parent_id
        .ok_or_else(|| anyhow!("Failed to create or find real_folder ID"))
}

/// Fetch a single active file path for the provided xxHash.
pub async fn fetch_one_file_path(
    moa_id: String,
    xxhs: String,
) -> Result<PathBuf> {
    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let fc_id = FileRepository::find_file_content_id(tx.as_mut(), xxhs.clone())
        .await?
        .ok_or_else(|| {
            anyhow!("No file content found for xxh3_64: {}", xxhs)
        })?;

    let asset_id =
        FileRepository::find_file_asset_id_by_content(tx.as_mut(), &fc_id)
            .await?
            .ok_or_else(|| {
                anyhow!("No file asset found for file content ID: {}", fc_id)
            })?;

    let active_path_ids =
        FileRepository::fetch_file_path_ids_for_asset(tx.as_mut(), &asset_id)
            .await?;

    if active_path_ids.is_empty() {
        bail!("No file path found for file asset ID: {asset_id}");
    }

    let file_path_id = active_path_ids.first().ok_or_else(|| {
        anyhow!("No file path found for file asset ID: {asset_id}")
    })?;

    let Some(path) =
        FileRepository::fetch_file_abs_path_cached(tx.as_mut(), file_path_id)
            .await?
    else {
        bail!("No file path found for file asset ID: {asset_id}");
    };

    Ok(path)
}

use anyhow::{anyhow, bail, Context, Result};
use async_recursion::async_recursion;
use sqlx::{Sqlite, Transaction};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use tauri::AppHandle;
use tokio::fs;
use tracing::{info, warn};

use crate::{
    db::repository::{
        file_repository::FileRepository, node_repository::NodeRepository,
        sroot_repository::SrootRepository,
    },
    models::{
        file::{FileInfo, FileType, FolderData, RealFolderData},
        node::Node,
    },
    services::{
        db::DB_MANAGER,
        storage_root::{self, ensure_storage_root_and_real_folder},
    },
    utils::{file_utils::file_mtime_epoch, path_utils::normalize_path},
};

use super::{
    job_queue::{enqueue_base_job, BaseThumbnailJob},
    utils::check_is_hidden,
};

#[derive(Default)]
struct UpsertFolderMetrics {
    total_elapsed: Duration,
    folder_creation: Duration,
    folder_creation_count: u64,
    tree_scanning: Duration,
    tree_scanning_count: u64,
    upsert_file: Duration,
    upsert_file_count: u64,
    file_size_buckets: HashMap<FileSizeBucket, BucketStats>,
}

impl UpsertFolderMetrics {
    fn record_folder_creation(&mut self, elapsed: Duration) {
        self.folder_creation += elapsed;
        self.folder_creation_count += 1;
    }

    fn record_tree_scanning(&mut self, elapsed: Duration) {
        self.tree_scanning += elapsed;
        self.tree_scanning_count += 1;
    }

    fn record_upsert_file(&mut self, size: Option<i64>, elapsed: Duration) {
        self.upsert_file += elapsed;
        self.upsert_file_count += 1;

        let bucket = FileSizeBucket::from_size(size);
        let entry = self
            .file_size_buckets
            .entry(bucket)
            .or_insert_with(BucketStats::default);
        entry.duration += elapsed;
        entry.count += 1;
    }

    fn log(&self, root_dir: &Path) {
        let mut bucket_entries: Vec<_> =
            self.file_size_buckets.iter().collect();
        bucket_entries.sort_by_key(|(bucket, _)| bucket.order());
        let bucket_summary = bucket_entries
            .into_iter()
            .map(|(bucket, stats)| {
                format!(
                    "{}: {}ms/{}",
                    bucket.label(),
                    stats.duration.as_millis(),
                    stats.count
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        let bucket_summary = if bucket_summary.is_empty() {
            "none".to_string()
        } else {
            bucket_summary
        };

        info!(
            "Upsert Folder Metrics
                dir                : {}
                total_ms           : {}
                tree_scan          : {} ms ({} runs)
                folder_creation    : {} ms ({} runs)
                upsert_file        : {} ms ({} runs)
                file_size_buckets  : {}
            ",
            root_dir.display(),
            self.total_elapsed.as_millis(),
            self.tree_scanning.as_millis(),
            self.tree_scanning_count,
            self.folder_creation.as_millis(),
            self.folder_creation_count,
            self.upsert_file.as_millis(),
            self.upsert_file_count,
            bucket_summary,
        );
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum FileSizeBucket {
    Unknown,
    UpTo1Mb,
    OneToTenMb,
    TenToHundredMb,
    OverHundredMb,
}

impl FileSizeBucket {
    fn from_size(size: Option<i64>) -> Self {
        match size {
            None => FileSizeBucket::Unknown,
            Some(bytes) if bytes < 1_000_000 => FileSizeBucket::UpTo1Mb,
            Some(bytes) if bytes < 10_000_000 => FileSizeBucket::OneToTenMb,
            Some(bytes) if bytes < 100_000_000 => {
                FileSizeBucket::TenToHundredMb
            }
            Some(_) => FileSizeBucket::OverHundredMb,
        }
    }

    fn label(self) -> &'static str {
        match self {
            FileSizeBucket::Unknown => "unknown",
            FileSizeBucket::UpTo1Mb => "<1MB",
            FileSizeBucket::OneToTenMb => "1-10MB",
            FileSizeBucket::TenToHundredMb => "10-100MB",
            FileSizeBucket::OverHundredMb => ">=100MB",
        }
    }

    fn order(self) -> u8 {
        match self {
            FileSizeBucket::Unknown => 0,
            FileSizeBucket::UpTo1Mb => 1,
            FileSizeBucket::OneToTenMb => 2,
            FileSizeBucket::TenToHundredMb => 3,
            FileSizeBucket::OverHundredMb => 4,
        }
    }
}

#[derive(Default)]
struct BucketStats {
    duration: Duration,
    count: u64,
}

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
pub async fn first_mount_folder(
    app: AppHandle,
    moa_id: String,
    node: Node,
    path: String,
) -> Result<()> {
    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let norm_path = normalize_path(Path::new(&path));

    let sroot_info = storage_root::detect_storage_root(&norm_path)?;

    let real_folder_id =
        ensure_storage_root_and_real_folder(&mut tx, &sroot_info, &norm_path)
            .await?;

    FileRepository::create_virtual_folder_mount(
        tx.as_mut(),
        node.id.clone(),
        real_folder_id.clone(),
    )
    .await?;

    upsert_folder(
        &mut tx,
        &app,
        &moa_id,
        real_folder_id.clone(),
        node.id,
        &norm_path,
        true,
        Some(true),
    )
    .await?;

    let _scan_id = start_scan_job(moa_id.clone(), real_folder_id).await?;

    tx.commit().await?;

    Ok(())
}

/// Spawn a background job that scans a real folder.
pub async fn start_scan_job(
    _moa_id: String,
    _real_folder_id: String,
) -> Result<String> {
    Ok(String::new())
}

/// Recursively upsert folder and file information.
async fn upsert_folder(
    tx: &mut Transaction<'_, Sqlite>,
    app: &AppHandle,
    moa_id: &str,
    parent_real_folder_id: String,
    parent_virtual_folder_id: String,
    abs_dir: &Path,
    recursive: bool,
    make_virtual_folder: Option<bool>,
) -> Result<()> {
    let mut metrics = UpsertFolderMetrics::default();
    let total_timer = Instant::now();

    upsert_folder_impl(
        tx,
        app,
        moa_id,
        parent_real_folder_id,
        parent_virtual_folder_id,
        abs_dir,
        recursive,
        make_virtual_folder,
        &mut metrics,
    )
    .await?;

    metrics.total_elapsed = total_timer.elapsed();
    metrics.log(abs_dir);

    Ok(())
}

/// Internal recursive implementation that accumulates metrics across the traversal.
#[async_recursion]
async fn upsert_folder_impl(
    tx: &mut Transaction<'_, Sqlite>,
    app: &AppHandle,
    moa_id: &str,
    parent_real_folder_id: String,
    parent_virtual_folder_id: String,
    abs_dir: &Path,
    recursive: bool,
    make_virtual_folder: Option<bool>,
    metrics: &mut UpsertFolderMetrics,
) -> Result<()> {
    let make_vf = make_virtual_folder.unwrap_or(true);

    let tree_scan_timer = Instant::now();
    let mut dir = fs::read_dir(abs_dir)
        .await
        .with_context(|| format!("failed to read_dir {:?}", abs_dir))?;

    let mut folder_entries: Vec<(PathBuf, String)> = Vec::new();
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

            if recursive {
                folder_entries.push((entry_path, name));
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
            upsert_file_entry(
                tx,
                app,
                moa_id,
                &parent_real_folder_id,
                &parent_virtual_folder_id,
                &entry,
                metrics,
            )
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

    if recursive {
        for (entry_path, name) in folder_entries {
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

            if let Err(e) = upsert_folder_impl(
                tx,
                app,
                moa_id,
                child_real_folder_id,
                child_vf.id,
                &entry_path,
                recursive,
                Some(make_vf),
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
    app: &AppHandle,
    moa_id: &str,
    parent_real_folder_id: &str,
    parent_virtual_folder_id: &str,
    entry: &fs::DirEntry,
    metrics: &mut UpsertFolderMetrics,
) -> Result<()> {
    let file_timer = Instant::now();
    let file_name = entry.file_name().to_string_lossy().to_string();

    let file_path = entry.path();
    let file_info =
        FileInfo::new(&file_path, parent_real_folder_id.to_string(), file_name)
            .await?;

    let file_path_id =
        FileRepository::insert_file_path(tx.as_mut(), &file_info).await?;

    let file_content_id =
        FileRepository::upsert_file_content(tx.as_mut(), &file_info).await?;

    NodeRepository::upsert_file_node(
        tx.as_mut(),
        parent_virtual_folder_id.to_string(),
        file_content_id.clone(),
    )
    .await?;

    FileRepository::upsert_file_path_content_binding(
        tx.as_mut(),
        &file_path_id,
        &file_content_id,
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

    let now = crate::utils::date::get_now_date();

    for component in components {
        abs_path.push(component);
        rel_path.push(component);

        let metadata = fs::metadata(&abs_path).await?;
        let mtime = file_mtime_epoch(&metadata)?;

        let data = RealFolderData {
            id: String::new(),
            storage_root_id: Some(sroot_id.to_owned()),
            parent_id: current_parent_id.clone(),
            name: component.to_string(),
            name_norm: component.to_lowercase(),
            root_rel_path: Some(rel_path.to_string_lossy().into_owned()),
            abs_path_cached: Some(abs_path.to_string_lossy().into_owned()),
            mtime,
            error_flag: crate::config::file::IntegrityCheckResult::Success,
            error_msg: None,
            last_seen_scan_id: None,
            last_seen_at: None,
            created_at: now.clone(),
            updated_at: now.clone(),
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

    let active_path_ids =
        FileRepository::fetch_matched_file_path_ids(tx.as_mut(), &fc_id)
            .await?;

    if active_path_ids.is_empty() {
        bail!("No active file path found for file content ID: {fc_id}");
    }

    let file_path_id = active_path_ids.first().ok_or_else(|| {
        anyhow!("No active file path found for file content ID: {fc_id}")
    })?;

    let Some(path) =
        FileRepository::fetch_file_abs_path_cached(tx.as_mut(), file_path_id)
            .await?
    else {
        bail!("No file path found for file content ID: {fc_id}");
    };

    Ok(path)
}

use anyhow::{anyhow, bail, Context, Result};
use async_recursion::async_recursion;
use serde::Serialize;
use sqlx::{Sqlite, Transaction};
use std::{
    collections::{BTreeSet, HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter};
use tokio::{fs, sync::Mutex};
use tracing::{info, warn};

use crate::{
    db::repository::{
        file_repository::{FileRepository, MountUpdateOptions},
        node_repository::NodeRepository,
        sroot_repository::SrootRepository,
    },
    models::{
        file::{
            FileInfo, FileType, FolderData, FolderOptionUpdatePayload,
            FolderPreview, FolderPreviewFileStat, FolderPreviewNode,
            FolderPreviewSummary, FolderSelection, RealFolderData,
        },
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
        let entry = self.file_size_buckets.entry(bucket).or_default();
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
enum ImportState {
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderImportProgressPayload {
    folder_id: String,
    state: ImportState,
    processed_bytes: u64,
    total_bytes: Option<u64>,
    processed_files: u64,
    total_files: Option<u64>,
    elapsed_ms: u64,
}

struct ImportProgressTracker {
    app_handle: AppHandle,
    moa_id: String,
    folder_id: String,
    total_bytes: Option<u64>,
    total_files: Option<u64>,
    processed_bytes: u64,
    processed_files: u64,
    started_at: Instant,
}

impl ImportProgressTracker {
    fn new(
        app_handle: AppHandle,
        moa_id: String,
        folder_id: String,
        total_bytes: Option<u64>,
        total_files: Option<u64>,
    ) -> Self {
        Self {
            app_handle,
            moa_id,
            folder_id,
            total_bytes,
            total_files,
            processed_bytes: 0,
            processed_files: 0,
            started_at: Instant::now(),
        }
    }

    fn emit(&self, state: ImportState) {
        let elapsed = self.started_at.elapsed().as_millis();
        let elapsed_ms = if elapsed > u128::from(u64::MAX) {
            u64::MAX
        } else {
            elapsed as u64
        };

        let payload = FolderImportProgressPayload {
            folder_id: self.folder_id.clone(),
            state,
            processed_bytes: self.processed_bytes,
            total_bytes: self.total_bytes,
            processed_files: self.processed_files,
            total_files: self.total_files,
            elapsed_ms,
        };

        let topic = format!("folder-import://progress/{}", self.moa_id);
        let _ = self.app_handle.emit(&topic, payload);
    }

    fn notify_start(&self) {
        self.emit(ImportState::Running);
    }

    fn record_file(&mut self, bytes: Option<i64>) {
        self.processed_files = self.processed_files.saturating_add(1);
        if let Some(size) = bytes {
            if size > 0 {
                self.processed_bytes =
                    self.processed_bytes.saturating_add(size as u64);
            }
        }
        self.emit(ImportState::Running);
    }

    fn finish(&mut self) {
        if let Some(total) = self.total_bytes {
            if self.processed_bytes < total {
                self.processed_bytes = total;
            }
        } else {
            self.total_bytes = Some(self.processed_bytes);
        }

        if let Some(total) = self.total_files {
            if self.processed_files < total {
                self.processed_files = total;
            }
        } else {
            self.total_files = Some(self.processed_files);
        }

        self.emit(ImportState::Completed);
    }

    fn fail(&self) {
        self.emit(ImportState::Failed);
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

const FILE_TYPE_ORDER: [FileType; 7] = [
    FileType::Image,
    FileType::Video,
    FileType::Document,
    FileType::GraphicTool,
    FileType::Audio,
    FileType::Archive,
    FileType::Unknown,
];

#[derive(Default)]
struct SelectionPlan {
    entries: HashMap<String, SelectionNode>,
}

#[derive(Clone, Default)]
struct SelectionNode {
    include: bool,
    allowed_types: Option<HashSet<FileType>>,
}

impl SelectionPlan {
    fn from_selection(selection: FolderSelection) -> Self {
        let mut entries = HashMap::new();
        for entry in selection.entries {
            let key = normalize_relative_key(&entry.relative_path);
            let allowed_types = entry
                .file_types
                .map(|types| types.into_iter().collect::<HashSet<FileType>>());
            entries.insert(
                key,
                SelectionNode { include: entry.include, allowed_types },
            );
        }

        SelectionPlan { entries }
    }

    fn get(&self, key: &str) -> Option<&SelectionNode> {
        self.entries.get(key)
    }
}

fn normalize_extension_list(list: Vec<String>) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut normalized = Vec::new();

    for value in list {
        let trimmed = value.trim().trim_start_matches('.').to_lowercase();
        if trimmed.is_empty() {
            continue;
        }
        if seen.insert(trimmed.clone()) {
            normalized.push(trimmed);
        }
    }

    normalized
}

fn derive_root_extension_list(
    selection: Option<&SelectionPlan>,
) -> Option<Vec<String>> {
    let root = selection?.get("");
    let allowed = root?.allowed_types.as_ref()?;

    let mut set: BTreeSet<String> = BTreeSet::new();
    for file_type in allowed.iter() {
        for ext in file_type.extensions() {
            set.insert(ext.to_string());
        }
    }

    if set.is_empty() {
        None
    } else {
        Some(set.into_iter().collect())
    }
}

#[derive(Default, Clone)]
pub struct ExtensionFilter {
    pub include: Option<HashSet<String>>,
    pub exclude: HashSet<String>,
}

impl ExtensionFilter {
    pub fn new(include: &[String], exclude: &[String]) -> Self {
        let include = if include.is_empty() {
            None
        } else {
            Some(include.iter().cloned().collect())
        };

        let exclude = exclude.iter().cloned().collect();

        ExtensionFilter { include, exclude }
    }

    pub fn allows(&self, path: &Path) -> bool {
        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.trim_start_matches('.').to_lowercase());

        if let Some(ref ext) = ext {
            if self.exclude.contains(ext) {
                return false;
            }

            if let Some(include) = &self.include {
                return include.contains(ext);
            }
        } else if self.include.is_some() {
            return false;
        }

        true
    }
}

#[derive(Default)]
struct PreviewAccumulator {
    total_folders: u64,
    total_files: u64,
    total_bytes: u64,
    file_type_totals: HashMap<FileType, PreviewFileStats>,
}

#[derive(Default)]
struct PreviewFileStats {
    count: u64,
    bytes: u64,
}

fn normalize_relative_key(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }

    let replaced = value.replace('\\', "/");
    let trimmed = replaced.trim_matches('/');
    if trimmed.is_empty() || trimmed == "." {
        String::new()
    } else {
        trimmed.to_string()
    }
}

fn relative_path_key(root: &Path, current: &Path) -> String {
    if let Ok(relative) = current.strip_prefix(root) {
        if relative.as_os_str().is_empty() {
            return String::new();
        }
        return join_path_components(relative);
    }

    join_path_components(current)
}

fn join_path_components(path: &Path) -> String {
    path.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn stats_map_to_vec(
    map: &HashMap<FileType, PreviewFileStats>,
) -> Vec<FolderPreviewFileStat> {
    let mut out = Vec::new();
    for file_type in FILE_TYPE_ORDER {
        if let Some(stats) = map.get(&file_type) {
            if stats.count > 0 {
                out.push(FolderPreviewFileStat {
                    file_type,
                    count: stats.count,
                    bytes: stats.bytes,
                });
            }
        }
    }

    out
}

/// Traverse the filesystem and produce a preview tree for the selected folder.
pub async fn collect_folder_preview(path: &Path) -> Result<FolderPreview> {
    let norm = normalize_path(path);

    let mut accumulator = PreviewAccumulator::default();
    let root =
        collect_folder_preview_impl(&norm, &norm, &mut accumulator).await?;

    let summary = FolderPreviewSummary {
        total_folders: accumulator.total_folders,
        total_files: accumulator.total_files,
        total_bytes: accumulator.total_bytes,
        file_type_totals: stats_map_to_vec(&accumulator.file_type_totals),
    };

    Ok(FolderPreview { root, summary })
}

#[async_recursion]
async fn collect_folder_preview_impl(
    abs_dir: &Path,
    root: &Path,
    accumulator: &mut PreviewAccumulator,
) -> Result<FolderPreviewNode> {
    accumulator.total_folders += 1;

    let mut dir = fs::read_dir(abs_dir)
        .await
        .with_context(|| format!("failed to read_dir {:?}", abs_dir))?;

    let mut children = Vec::new();
    let mut local_stats: HashMap<FileType, PreviewFileStats> = HashMap::new();
    let mut total_files = 0_u64;
    let mut total_bytes = 0_u64;

    while let Some(entry) = dir
        .next_entry()
        .await
        .with_context(|| format!("failed to read entry under {:?}", abs_dir))?
    {
        let entry_path = entry.path();

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
            let child =
                collect_folder_preview_impl(&entry_path, root, accumulator)
                    .await?;
            children.push(child);
            continue;
        }

        if file_type.is_file() {
            let kind = FileType::from(entry_path.as_path());
            let metadata = entry.metadata().await.with_context(|| {
                format!("failed to get metadata for {:?}", entry_path)
            })?;
            let size = metadata.len();

            total_files += 1;
            total_bytes += size;

            let local_entry = local_stats.entry(kind).or_default();
            local_entry.count += 1;
            local_entry.bytes += size;

            let global_entry =
                accumulator.file_type_totals.entry(kind).or_default();
            global_entry.count += 1;
            global_entry.bytes += size;

            accumulator.total_files += 1;
            accumulator.total_bytes += size;
        }
    }

    let name = abs_dir
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| abs_dir.to_string_lossy().into_owned());

    Ok(FolderPreviewNode {
        name,
        path: abs_dir.to_string_lossy().into_owned(),
        relative_path: relative_path_key(root, abs_dir),
        total_files,
        total_bytes,
        file_stats: stats_map_to_vec(&local_stats),
        children,
    })
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
pub async fn start_scan_job(
    _moa_id: String,
    _real_folder_id: String,
) -> Result<String> {
    Ok(String::new())
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

    upsert_folder_impl(
        tx,
        moa_id,
        parent_real_folder_id,
        parent_virtual_folder_id,
        abs_dir,
        config,
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
async fn upsert_folder_impl(
    tx: &mut Transaction<'_, Sqlite>,
    moa_id: &str,
    parent_real_folder_id: String,
    parent_virtual_folder_id: String,
    abs_dir: &Path,
    config: FolderUpsertConfig<'_>,
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
            upsert_file_entry(tx, moa_id, params, &config, metrics)
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

    let file_path_id =
        FileRepository::insert_file_path(tx.as_mut(), &file_info).await?;

    let file_content_id =
        FileRepository::upsert_file_content(tx.as_mut(), &file_info).await?;

    NodeRepository::upsert_file_node(
        tx.as_mut(),
        params.parent_virtual_folder_id.to_string(),
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

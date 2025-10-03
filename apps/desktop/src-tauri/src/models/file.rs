use anyhow::{anyhow, Context, Result};
use core::fmt;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Type};

#[cfg(not(target_os = "windows"))]
use std::{
    convert::From,
    fs::{self, Metadata},
    path::{Path, PathBuf},
    str::FromStr,
    time::UNIX_EPOCH,
};

use tauri::{path::BaseDirectory, AppHandle, Manager};

use crate::{
    config::file::IntegrityCheckResult,
    services::file_service::{self, xxh3_64_of},
    utils::file_utils::guess_mime,
};

/// Aggregated health state for a mounted folder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FolderHealthState {
    Normal,
    Warning,
    Error,
}

impl Default for FolderHealthState {
    fn default() -> Self {
        Self::Normal
    }
}

/// Runtime state for a virtual folder mount.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderMountState {
    pub mount_id: String,
    pub real_folder_id: String,
    pub recursive: bool,
    pub sync_enabled: bool,
    pub suppress_warnings: bool,
    pub real_path: Option<String>,
    pub error_flag: IntegrityCheckResult,
    pub error_msg: Option<String>,
    pub last_seen_scan_id: Option<String>,
    pub last_seen_at: Option<String>,
    #[serde(default)]
    pub include_extensions: Vec<String>,
    #[serde(default)]
    pub exclude_extensions: Vec<String>,
}

impl Default for FolderMountState {
    fn default() -> Self {
        Self {
            mount_id: String::new(),
            real_folder_id: String::new(),
            recursive: true,
            sync_enabled: false,
            suppress_warnings: false,
            real_path: None,
            error_flag: IntegrityCheckResult::Success,
            error_msg: None,
            last_seen_scan_id: None,
            last_seen_at: None,
            include_extensions: Vec::new(),
            exclude_extensions: Vec::new(),
        }
    }
}

/// Folder node metadata fetched from the database.
#[derive(Debug, FromRow, Serialize, Deserialize, Clone)]
pub struct NodeFolder {
    pub folder_id: String,
    pub node_id: String,
    pub folder_name: String,
    #[serde(default)]
    pub mounts: Vec<FolderMountState>,
    #[serde(default)]
    pub health: FolderHealthState,
}

/// File content metadata persisted in the database.
#[derive(Debug, FromRow, Serialize, Deserialize, Clone)]
pub struct FileContent {
    pub file_id: String,
    pub node_id: String,
    pub mime: String,
    pub size: i64,
    pub kind: FileType,
    pub sha256: Option<String>,
    pub xxh3_64: String,
    pub file_name: String,
}

/// Parameters required to create a new virtual folder.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FolderData {
    pub name: String,
    pub path: Option<String>,
    pub parent_id: String,
    pub selection: Option<FolderSelection>,
    #[serde(default, rename = "expectedBytes")]
    pub expected_bytes: Option<u64>,
    #[serde(default, rename = "expectedFiles")]
    pub expected_files: Option<u64>,
}

/// Payload for updating folder mount configuration from the renderer.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FolderOptionUpdatePayload {
    pub path: Option<String>,
    #[serde(default)]
    pub recursive: bool,
    #[serde(default)]
    pub sync_enabled: bool,
    #[serde(default)]
    pub suppress_warnings: bool,
    #[serde(default)]
    pub include_extensions: Option<Vec<String>>,
    #[serde(default)]
    pub exclude_extensions: Option<Vec<String>>,
}

/// Describes the folder/file-type filters chosen by the user before import.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FolderSelection {
    #[serde(default)]
    pub entries: Vec<FolderSelectionEntry>,
}

/// Specific folder override provided by the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSelectionEntry {
    pub relative_path: String,
    pub include: bool,
    #[serde(default)]
    pub file_types: Option<Vec<FileType>>,
}

/// Aggregated file statistics grouped by file type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderPreviewFileStat {
    pub file_type: FileType,
    pub count: u64,
    pub bytes: u64,
}

/// Preview information about a folder and its descendants.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderPreviewNode {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub total_files: u64,
    pub total_bytes: u64,
    pub file_stats: Vec<FolderPreviewFileStat>,
    pub children: Vec<FolderPreviewNode>,
}

/// Summary of the entire preview tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderPreviewSummary {
    pub total_folders: u64,
    pub total_files: u64,
    pub total_bytes: u64,
    pub file_type_totals: Vec<FolderPreviewFileStat>,
}

/// Full preview payload returned to the renderer before import.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderPreview {
    pub root: FolderPreviewNode,
    pub summary: FolderPreviewSummary,
}

/// Supported operating systems for storage roots.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, Default,
)]
#[sqlx(type_name = "TEXT")]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum OsPlatform {
    Windows,
    Macos,
    Linux,
    #[default]
    Unknown,
}

/// Classification for the type of storage volume backing a root path.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, Default,
)]
#[sqlx(type_name = "TEXT")]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum StorageKind {
    Internal,
    External,
    Network,
    Virtual,
    #[default]
    Unknown,
}

impl From<&str> for StorageKind {
    fn from(s: &str) -> Self {
        if s.eq_ignore_ascii_case("internal") {
            Self::Internal
        } else if s.eq_ignore_ascii_case("external") {
            Self::External
        } else if s.eq_ignore_ascii_case("network") {
            Self::Network
        } else if s.eq_ignore_ascii_case("virtual") {
            Self::Virtual
        } else {
            Self::Unknown
        }
    }
}

impl From<&str> for OsPlatform {
    fn from(s: &str) -> Self {
        if s.eq_ignore_ascii_case("windows") {
            Self::Windows
        } else if s.eq_ignore_ascii_case("macos") {
            Self::Macos
        } else if s.eq_ignore_ascii_case("linux") {
            Self::Linux
        } else {
            Self::Unknown
        }
    }
}
/// Metadata describing a discovered storage root.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct StorageRootInfo {
    pub platform: OsPlatform,
    pub kind: StorageKind,
    pub stable_id: String,
    pub secondary_id: String,
    pub label: String,
    pub is_available: bool,
    pub mount_path: String,

    pub updated_at: String,
    pub created_at: String,
}

/// Logical file types derived from file extensions.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Type,
    Default,
    Hash,
)]
#[sqlx(type_name = "TEXT")]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum FileType {
    Image,
    Video,
    Document,
    GraphicTool,
    Audio,
    Archive,
    #[default]
    Unknown,
}

const IMAGE_EXTENSIONS: &[&str] =
    &["jpg", "jpeg", "png", "gif", "bmp", "tiff", "webp", "heic"];
const VIDEO_EXTENSIONS: &[&str] =
    &["mp4", "mov", "avi", "mkv", "webm", "flv", "wmv"];
const AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "flac", "aac", "ogg", "m4a"];
const DOCUMENT_EXTENSIONS: &[&str] =
    &["pdf", "txt", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "md"];
const GRAPHIC_TOOL_EXTENSIONS: &[&str] =
    &["psd", "ai", "xd", "fig", "clip", "kra", "sai", "pur"];
const ARCHIVE_EXTENSIONS: &[&str] = &["zip", "rar", "7z", "tar", "gz"];

impl FromStr for FileType {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "image" => Ok(Self::Image),
            "video" => Ok(Self::Video),
            "document" => Ok(Self::Document),
            "graphictool" => Ok(Self::GraphicTool),
            "audio" => Ok(Self::Audio),
            "archive" => Ok(Self::Archive),
            _ => Ok(Self::Unknown),
        }
    }
}
impl From<&Path> for FileType {
    fn from(path: &Path) -> Self {
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        let ext = ext.as_str();

        if IMAGE_EXTENSIONS.contains(&ext) {
            FileType::Image
        } else if VIDEO_EXTENSIONS.contains(&ext) {
            FileType::Video
        } else if AUDIO_EXTENSIONS.contains(&ext) {
            FileType::Audio
        } else if DOCUMENT_EXTENSIONS.contains(&ext) {
            FileType::Document
        } else if GRAPHIC_TOOL_EXTENSIONS.contains(&ext) {
            FileType::GraphicTool
        } else if ARCHIVE_EXTENSIONS.contains(&ext) {
            FileType::Archive
        } else {
            FileType::Unknown
        }
    }
}

impl FileType {
    pub fn extensions(&self) -> &'static [&'static str] {
        match self {
            FileType::Image => IMAGE_EXTENSIONS,
            FileType::Video => VIDEO_EXTENSIONS,
            FileType::Document => DOCUMENT_EXTENSIONS,
            FileType::GraphicTool => GRAPHIC_TOOL_EXTENSIONS,
            FileType::Audio => AUDIO_EXTENSIONS,
            FileType::Archive => ARCHIVE_EXTENSIONS,
            FileType::Unknown => &[],
        }
    }

    /// Validate an image file with size, signature, and pixel constraints.
    pub fn check_is_img(path: &Path) -> Result<()> {
        const MAX_BYTES: u64 = 20 * 1024 * 1024; // 20MB
        const MAX_PIXELS: u64 = 400_000_000; // 400M px

        // 1) Size check via metadata (no need to open the file here)
        let meta = fs::metadata(path).with_context(|| {
            format!("Failed to read metadata: {}", path.display())
        })?;

        let len = meta.len();
        if len == 0 {
            return Err(anyhow!("Empty file"));
        }
        if len > MAX_BYTES {
            return Err(anyhow!(
                "File too large: {} bytes > {}",
                len,
                MAX_BYTES
            ));
        }

        // 2) MIME magic (signature) check
        //    Note: infer reads from the path internally.
        let is_image_signature = infer::get_from_path(path)
            .map_err(|e| anyhow!("Type sniffing failed: {e}"))?
            .map(|k| k.mime_type().starts_with("image/"))
            .unwrap_or(false);

        if !is_image_signature {
            return Err(anyhow!("Not an image file: {}", path.display()));
        }

        // 3) Pixel/Dimension check (uses 'image' crate)
        let (w, h) = image::image_dimensions(path).with_context(|| {
            format!("Failed to read image dimensions: {}", path.display())
        })?;

        let pixels = (w as u64)
            .checked_mul(h as u64)
            .ok_or_else(|| anyhow!("Pixel count overflow: {}x{}", w, h))?;

        if pixels == 0 {
            return Err(anyhow!("Invalid image dimensions: {}x{}", w, h));
        }
        if pixels > MAX_PIXELS {
            return Err(anyhow!(
                "Image too large: {} pixels > {}",
                pixels,
                MAX_PIXELS
            ));
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTypeExtensionGroup {
    pub file_type: FileType,
    #[serde(default)]
    pub extensions: Vec<String>,
}

pub fn file_type_extension_groups() -> Vec<FileTypeExtensionGroup> {
    [
        FileType::Image,
        FileType::Video,
        FileType::Document,
        FileType::GraphicTool,
        FileType::Audio,
        FileType::Archive,
        FileType::Unknown,
    ]
    .into_iter()
    .map(|file_type| FileTypeExtensionGroup {
        file_type,
        extensions: file_type
            .extensions()
            .iter()
            .map(|ext| ext.to_string())
            .collect(),
    })
    .collect()
}

/// Computed metadata used when ingesting file paths.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct FileInfo {
    pub mime_guess: String,
    pub kind_guess: FileType,

    pub file_exists: bool,
    pub file_size: Option<i64>, // non-null if exists & accessible
    pub file_mtime: Option<i64>, // non-null if exists & accessible

    pub xxh3_64: String,
    pub sha256: Option<String>,

    pub real_folder_id: String,

    pub file_name: String,
    pub file_name_norm: String,
}

/// Summary information about a file content used by the detail sidebar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSummary {
    pub file_id: String,
    pub node_id: String,
    pub file_name: String,
    pub mime: String,
    pub size: i64,
    pub hash: String,
    pub kind: FileType,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// Virtual folder nodes that currently reference the file.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFolderInfo {
    pub node_id: String,
    pub name: String,
}

/// Health state for a specific file path.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum FilePathStatus {
    Ok,
    Warning,
    Error,
}

/// Computed status for each filesystem path bound to a file content.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePathDetail {
    pub id: String,
    pub path: Option<String>,
    pub exists: bool,
    pub stored_mtime: Option<i64>,
    pub current_mtime: Option<i64>,
    pub hash_matches: Option<bool>,
    pub status: FilePathStatus,
    pub warning: Option<String>,
    pub error: Option<String>,
}

/// Full detail payload consumed by the renderer sidebar.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDetail {
    pub file: FileSummary,
    pub folders: Vec<FileFolderInfo>,
    pub paths: Vec<FilePathDetail>,
}

impl FileInfo {
    /// Build a `FileInfo` record by reading metadata from disk.
    pub async fn new(
        moa_id: &str,
        file_path: &Path,
        real_folder_id: String,
        file_name: String,
    ) -> Result<Self> {
        let file_name_norm = file_name.to_lowercase();
        let mime_guess = guess_mime(file_path);
        let kind_guess = FileType::from(file_path);

        let meta = tokio::fs::metadata(file_path).await.with_context(|| {
            format!("Failed to read metadata: {}", file_path.display())
        })?;

        let file_exists = meta.is_file();
        let file_size =
            if file_exists { Some(meta.len() as i64) } else { None };

        let file_mtime = if file_exists {
            Some(Self::file_mtime_epoch(&meta)?)
        } else {
            None
        };

        let xxh3_64 = if let Some(hash) = {
            if let Some(mtime) = file_mtime {
                file_service::hash::fetch_hash_by_file_info(
                    moa_id,
                    &real_folder_id,
                    &file_name_norm,
                    mtime,
                )
                .await?
            } else {
                None
            }
        } {
            hash
        } else {
            xxh3_64_of(file_path).await.with_context(|| {
                format!("Failed to calculate xxHash64 for {:?}", file_path)
            })?
        };
        // let sha256_image: Option<String> = if kind_guess == FileType::Image {
        //     Some(crate::services::file_service::sha256_of_img(file_path)?)
        // } else {
        //     None
        // };
        Ok(FileInfo {
            mime_guess,
            kind_guess,

            file_exists,
            file_size,
            file_mtime,

            xxh3_64,
            sha256: None,

            real_folder_id,
            file_name,
            file_name_norm,
        })
    }

    pub fn file_mtime_epoch(meta: &Metadata) -> Result<i64> {
        if let Ok(mtime) = meta.modified()?.duration_since(UNIX_EPOCH) {
            Ok(mtime.as_secs() as i64)
        } else {
            Err(anyhow!("Failed to get file modification time"))
        }
    }
}

// #[derive(Debug, Clone, FromRow, Serialize)]
// pub struct DirectoryInfo {
//     parent_real_folder_id: String,
//     parent_virtual_folder_id: String,
//     abs_dir: PathBuf,
//     re: bool,
//     make_virtual_folder: Option<bool>,

//     files: Vec<FileInfo>,
//     folders: Vec<DirectoryInfo>,
// }

/// Payload used to upsert real-folder records in the database.
pub struct RealFolderData {
    pub storage_root_id: Option<String>,
    pub parent_id: Option<String>,
    pub name: String,
    pub name_norm: String,
    pub root_rel_path: Option<String>,
    pub abs_path_cached: Option<String>,
    pub mtime: i64,
}

// -- Thumb --

/// Resize strategy that controls how thumbnails are generated.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, Default,
)]
#[sqlx(type_name = "TEXT")]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ResizeMode {
    Upscale,
    #[default]
    Original,
}

/// Output image formats supported for thumbnail generation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ImageFmt {
    Webp,
    Jpeg,
}

impl ImageFmt {
    /// Map to file extension (lowercase).
    pub fn ext(self) -> &'static str {
        match self {
            ImageFmt::Webp => "webp",
            ImageFmt::Jpeg => "jpeg",
        }
    }

    /// File-name token; currently same as ext (kept for future-proofing).
    pub fn token(self) -> &'static str {
        self.ext()
    }
}

/// Thumbnail specification describing dimensions and encoding.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ThumbSpec {
    pub width: u32,
    pub height: u32,
    pub dpr: Option<u8>,          // 1 | 2 | 3
    pub fmt: Option<ImageFmt>,    // webp | jpeg
    pub v: Option<u8>, // consider removing if schema_version is canonical
    pub mode: Option<ResizeMode>, // optional file-name token
    pub key: String,
}

/// Request payload containing thumbnail requirements per file.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ThumbReqInfo {
    pub xxhs: String, // ASCII-hex (will be normalized to lowercase)
    pub specs: Vec<ThumbSpec>,
}

/// Wrapper representing the resolved thumbnail path on disk.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ThumbPath(pub PathBuf);

/// Width of the cached base thumbnail used for downstream resizing.
pub const THUMB_BASE_WIDTH: u32 = 512;

/// Path to the cached base thumbnail for a file hash.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ThumbBasePath(pub PathBuf);

impl ThumbPath {
    /// path/to/ab/cd/<hash>/<hash>_<width>x<height>_dpr<1|2|3>[_modeToken].<ext>
    pub async fn new(
        app: &AppHandle,
        _moa_id: &str,
        spec: ThumbSpec,
        hash: String,
        schema_version: u8,
    ) -> Result<Self> {
        // -- Validation --
        // Validate hex
        if hash.len() < 4 {
            return Err(anyhow!("xxhs must be at least 4 chars long"));
        }
        if !is_ascii_hex(&hash) {
            return Err(anyhow!("xxhs must be ASCII-hex [0-9a-fA-F]"));
        }

        // Normalize to lowercase for path stability
        let xxhs = hash.to_ascii_lowercase();
        // Dimensions
        let width = spec.width;
        let height = spec.height;
        if width == 0 {
            return Err(anyhow!(
                "width must be > 0 (got {}x{})",
                width,
                height
            ));
        }

        // DPR
        let dpr = spec.dpr.unwrap_or(1);
        if !(1..=3).contains(&dpr) {
            return Err(anyhow!("dpr must be in 1..=3 (got {})", dpr));
        }

        // Format
        let fmt = spec.fmt.unwrap_or(ImageFmt::Jpeg);

        // --------------------------------------------------------------------

        // First 4 chars -> "ab/cd"
        let ab = &xxhs[0..2];
        let cd = &xxhs[2..4];

        let mode_token = match spec.mode.unwrap_or_default() {
            ResizeMode::Original => None,
            ResizeMode::Upscale => Some("upscale"),
        };

        // Filename core.
        let mut core = format!(
            "{}_{}x{}_dpr{}_v{}",
            xxhs, width, height, dpr, schema_version
        );

        if let Some(tok) = mode_token {
            core.push('_');
            core.push_str(tok);
        }

        let filename = format!("{}.{}", core, fmt.ext());

        // ab/cd/<xxhs>/<filename>
        let rel_path = PathBuf::from("thumbs")
            .join(ab)
            .join(cd)
            .join(&xxhs)
            .join(filename);

        let path = app.path().resolve(rel_path, BaseDirectory::AppCache)?;
        Ok(ThumbPath(path))
    }

    pub fn as_path(&self) -> &Path {
        &self.0
    }
}

impl ThumbBasePath {
    /// Cached base thumbnail path "thumbs/base/vX/ab/cd/<hash>/<hash>_w512_auto_vX.jpeg".
    pub fn new(
        app: &AppHandle,
        _moa_id: &str,
        hash: &str,
        schema_version: u8,
    ) -> Result<Self> {
        if hash.len() < 4 {
            return Err(anyhow!("xxhs must be at least 4 chars long"));
        }
        if !is_ascii_hex(hash) {
            return Err(anyhow!("xxhs must be ASCII-hex [0-9a-fA-F]"));
        }

        let xxhs = hash.to_ascii_lowercase();
        let ab = &xxhs[0..2];
        let cd = &xxhs[2..4];

        let filename = format!(
            "{}_w{}_auto_v{}.jpeg",
            xxhs, THUMB_BASE_WIDTH, schema_version
        );

        let rel_path = PathBuf::from("thumbs")
            .join("base")
            .join(format!("v{}", schema_version))
            .join(ab)
            .join(cd)
            .join(&xxhs)
            .join(filename);

        let path = app.path().resolve(rel_path, BaseDirectory::AppCache)?;
        Ok(ThumbBasePath(path))
    }

    pub fn as_path(&self) -> &Path {
        &self.0
    }
}

impl fmt::Display for ThumbBasePath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0.display())
    }
}

impl AsRef<Path> for ThumbBasePath {
    fn as_ref(&self) -> &Path {
        self.as_path()
    }
}

impl From<ThumbBasePath> for PathBuf {
    fn from(tp: ThumbBasePath) -> Self {
        tp.0
    }
}

impl fmt::Display for ThumbPath {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0.display())
    }
}

impl AsRef<Path> for ThumbPath {
    fn as_ref(&self) -> &Path {
        self.as_path()
    }
}

impl From<PathBuf> for ThumbPath {
    fn from(p: PathBuf) -> Self {
        ThumbPath(p)
    }
}

impl From<ThumbPath> for PathBuf {
    fn from(tp: ThumbPath) -> Self {
        tp.0
    }
}

/// Validate ASCII-hex strings (0-9a-fA-F) quickly.
fn is_ascii_hex(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| (b as char).is_ascii_hexdigit())
}

/// Batch thumbnail request submitted from the frontend.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ThumbRequest {
    pub items: Vec<ThumbReqInfo>,
}

/// Status markers for thumbnail availability.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThumbStatus {
    Hit,
    Miss,
    Error,
}

/// Result entry for a single thumbnail specification.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ThumbResSpec {
    pub status: ThumbStatus,
    pub url: Option<String>,
    pub thumb_key: String,
    pub enqueued: bool,
    pub error_msg: Option<String>,
}

/// Aggregated thumbnail results for a single file hash.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ThumbResInfo {
    pub xxhs: String,
    pub specs: Vec<ThumbResSpec>,
}

/// Response returned to the renderer containing thumbnail states.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ThumbResponse {
    pub items: Vec<ThumbResInfo>,
}

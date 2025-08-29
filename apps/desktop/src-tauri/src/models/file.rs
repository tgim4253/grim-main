use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Type};
use std::{
    convert::{From, TryFrom},
    fs::{self, Metadata},
    path::Path,
    string,
    time::UNIX_EPOCH,
};

use crate::{services::file_service::xxh3_64_of, utils::file_utils::guess_mime};

#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct NodeFolder {
    pub folder_id: String,
    pub node_id: String,
    pub folder_name: Option<String>,
}

#[derive(Debug, FromRow, Serialize, Deserialize)]
pub struct FileContent {
    pub file_id: String,
    pub node_id: String,
    pub mime: Option<String>,
    pub size: Option<i64>,
    pub sha256: Option<String>,
    pub file_name: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FolderData {
    pub name: String,
    pub path: Option<String>,
    pub parent_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, Default)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, Default)]
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, Default)]
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

impl From<&Path> for FileType {
    fn from(path: &Path) -> Self {
        match path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase().as_str() {
            // Image
            "jpg" | "jpeg" | "png" | "gif" | "bmp" | "tiff" | "webp" | "heic" => FileType::Image,

            // Video
            "mp4" | "mov" | "avi" | "mkv" | "webm" | "flv" | "wmv" => FileType::Video,

            // Audio
            "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" => FileType::Audio,

            // Document
            "pdf" | "txt" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "odt" | "md" => {
                FileType::Document
            }

            // Graphic / Tool-specific (이미지 툴)
            "psd" => FileType::GraphicTool,  // Photoshop
            "ai" => FileType::GraphicTool,   // Illustrator
            "xd" => FileType::GraphicTool,   // Adobe XD
            "fig" => FileType::GraphicTool,  // Figma
            "clip" => FileType::GraphicTool, // Clip Studio
            "kra" => FileType::GraphicTool,  // Krita
            "sai" => FileType::GraphicTool,  // Paint Tool SAI
            "pur" => FileType::GraphicTool,  // PureRef

            // 압축파일
            "zip" | "rar" | "7z" | "tar" | "gz" => FileType::Archive,

            // Default
            _ => FileType::Unknown,
        }
    }
}

impl FileType {
    /// Validate an image file with size, signature, and pixel constraints.
    pub fn check_is_img(path: &Path) -> Result<()> {
        const MAX_BYTES: u64 = 20 * 1024 * 1024; // 20MB
        const MAX_PIXELS: u64 = 400_000_000; // 400M px

        // 1) Size check via metadata (no need to open the file here)
        let meta = fs::metadata(path)
            .with_context(|| format!("Failed to read metadata: {}", path.display()))?;

        let len = meta.len();
        if len == 0 {
            return Err(anyhow!("Empty file"));
        }
        if len > MAX_BYTES {
            return Err(anyhow!("File too large: {} bytes > {}", len, MAX_BYTES));
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
        let (w, h) = image::image_dimensions(path)
            .with_context(|| format!("Failed to read image dimensions: {}", path.display()))?;

        let pixels = (w as u64)
            .checked_mul(h as u64)
            .ok_or_else(|| anyhow!("Pixel count overflow: {}x{}", w, h))?;

        if pixels == 0 {
            return Err(anyhow!("Invalid image dimensions: {}x{}", w, h));
        }
        if pixels > MAX_PIXELS {
            return Err(anyhow!("Image too large: {} pixels > {}", pixels, MAX_PIXELS));
        }

        Ok(())
    }
}

#[derive(Debug, Clone, FromRow, Serialize)]
pub struct FileInfo {
    pub mime_guess: String,
    pub kind_guess: FileType,

    pub file_exists: bool,
    pub file_size: Option<i64>,  // non-null if exists & accessible
    pub file_mtime: Option<i64>, // non-null if exists & accessible

    pub xxh3_64: String,

    pub real_folder_id: String,

    pub file_name: String,
    pub file_name_norm: String,
}

impl FileInfo {
    pub async fn new(file_path: &Path, real_folder_id: String, file_name: String) -> Result<Self> {
        let file_name_norm = file_name.to_lowercase();
        let mime_guess = guess_mime(file_path);
        let kind_guess = FileType::from(file_path);

        let meta = tokio::fs::metadata(file_path)
            .await
            .with_context(|| format!("Failed to read metadata: {}", file_path.display()))?;

        let file_exists = meta.is_file();
        let file_size = if file_exists { Some(meta.len() as i64) } else { None };

        let file_mtime = if file_exists { Some(Self::file_mtime_epoch(&meta)?) } else { None };

        // let sha256_image: Option<String> = if kind_guess == FileType::Image {
        //     Some(crate::services::file_service::sha256_of_img(file_path)?)
        // } else {
        //     None
        // };
        let xxh3_64 = xxh3_64_of(&file_path)
            .with_context(|| format!("Failed to calculate xxHash64 for {:?}", file_path))?;

        Ok(FileInfo {
            mime_guess,
            kind_guess,

            file_exists,
            file_size,
            file_mtime,

            xxh3_64,

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
//     recursive: bool,
//     make_virtual_folder: Option<bool>,

//     files: Vec<FileInfo>,
//     folders: Vec<DirectoryInfo>,
// }

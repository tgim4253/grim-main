use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Type};
use std::{
    convert::{From, TryFrom},
    string,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "TEXT")] // SQLite TEXT
#[sqlx(rename_all = "lowercase")] // NotFound → "notfound"
#[serde(rename_all = "lowercase")] // JSON 직렬화용(선택)
pub enum IntegrityCheckResult {
    NotFound = -1,
    Success = 0,
    Mismatch = 1,
}

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

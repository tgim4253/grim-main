use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Type};
use std::convert::{From, TryFrom};

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

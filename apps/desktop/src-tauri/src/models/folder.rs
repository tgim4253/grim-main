use serde::{Deserialize, Serialize};

pub const SYSTEM_UNCATEGORIZED_FOLDER_NAME: &str = "Uncategorized";

#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default,
)]
#[serde(rename_all = "snake_case")]
pub enum VirtualFolderKind {
    #[default]
    User,
    SystemUncategorized,
}

impl VirtualFolderKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::SystemUncategorized => "system_uncategorized",
        }
    }

    pub fn from_db(value: &str) -> Self {
        match value {
            "system_uncategorized" => Self::SystemUncategorized,
            _ => Self::User,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VirtualFolder {
    pub id: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    pub name: String,
    pub full_path: String,
    #[serde(default)]
    pub alias: Option<String>,
    #[serde(default)]
    pub kind: VirtualFolderKind,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveVirtualFolderPayload {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub alias: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveVirtualFolderResult {
    pub saved_folder_id: String,
    #[serde(default)]
    pub folders: Vec<VirtualFolder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteVirtualFolderPayload {
    pub folder_id: String,
}

use serde::{Deserialize, Serialize};

use crate::models::{folder::VirtualFolder, record::CroquisRecordSummary};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetSummary {
    pub id: String,
    pub hash: String,
    #[serde(default)]
    pub storage_path: Option<String>,
    #[serde(default)]
    pub thumbnail_path: Option<String>,
    pub file_name: String,
    pub file_size: i64,
    #[serde(default)]
    pub mime_type: Option<String>,
    #[serde(default)]
    pub width: Option<i64>,
    #[serde(default)]
    pub height: Option<i64>,
    #[serde(default)]
    pub modified_at: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetDetail {
    #[serde(flatten)]
    pub asset: AssetSummary,
    #[serde(default)]
    pub virtual_folders: Vec<VirtualFolder>,
    #[serde(default)]
    pub related_records: Vec<CroquisRecordSummary>,
    #[serde(default)]
    pub last_croquis_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AssetListSource {
    AllAssets,
    Uncategorized,
    Folder {
        #[serde(rename = "folderId", alias = "folder_id")]
        folder_id: String,
    },
    FolderDescendants {
        #[serde(rename = "folderId", alias = "folder_id")]
        folder_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRequest {
    #[serde(default)]
    pub file_paths: Vec<String>,
    #[serde(default)]
    pub virtual_folder_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreviewResult {
    pub asset_count: usize,
    pub total_size: i64,
    #[serde(default)]
    pub file_paths: Vec<String>,
    #[serde(default)]
    pub failed: Vec<ImportFailure>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportRemoteImagesRequest {
    #[serde(default)]
    pub sources: Vec<String>,
    #[serde(default)]
    pub virtual_folder_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailure {
    pub file_path: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: usize,
    pub reused: usize,
    #[serde(default)]
    pub failed: Vec<ImportFailure>,
    #[serde(default)]
    pub assets: Vec<AssetSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAssetFoldersPayload {
    pub asset_id: String,
    #[serde(default)]
    pub virtual_folder_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BatchUpdateAssetFoldersMode {
    Append,
    Replace,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchUpdateAssetFoldersPayload {
    #[serde(default)]
    pub asset_ids: Vec<String>,
    #[serde(default)]
    pub virtual_folder_ids: Vec<String>,
    pub mode: BatchUpdateAssetFoldersMode,
}

#[cfg(test)]
mod tests {
    use super::AssetListSource;

    #[test]
    fn asset_list_source_accepts_camel_case_folder_id() {
        let source: AssetListSource =
            serde_json::from_value(serde_json::json!({
                "kind": "folderDescendants",
                "folderId": "folder-1",
            }))
            .expect("source should deserialize");

        match source {
            AssetListSource::FolderDescendants { folder_id } => {
                assert_eq!(folder_id, "folder-1");
            }
            _ => panic!("unexpected asset list source"),
        }
    }
}

use serde::{Deserialize, Serialize};

use crate::models::{
    folder::VirtualFolder, record::CroquisRecordSummary, tag::Tag,
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetSummary {
    pub id: String,
    pub hash: String,
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
    pub tags: Vec<Tag>,
    #[serde(default)]
    pub related_records: Vec<CroquisRecordSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AssetListSource {
    AllAssets,
    Uncategorized,
    Folder { folder_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRequest {
    #[serde(default)]
    pub file_paths: Vec<String>,
    #[serde(default)]
    pub virtual_folder_ids: Vec<String>,
    #[serde(default)]
    pub tag_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub imported: usize,
    pub reused: usize,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAssetTagsPayload {
    pub asset_id: String,
    #[serde(default)]
    pub tag_ids: Vec<String>,
}

use serde::{Deserialize, Serialize};

use crate::models::croquis::CroquisPreferences;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySettings {
    #[serde(default)]
    pub active_session_preset_id: Option<String>,
    #[serde(default)]
    pub croquis_preferences: Option<CroquisPreferences>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetType {
    ImportedImage,
    LinkedExternal,
}

impl Default for AssetType {
    fn default() -> Self {
        Self::ImportedImage
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AssetSummary {
    pub id: String,
    pub r#type: AssetType,
    #[serde(default)]
    pub hash: Option<String>,
    #[serde(default)]
    pub storage_path: Option<String>,
    #[serde(default)]
    pub external_path: Option<String>,
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
    pub tags: Vec<Tag>,
    #[serde(default)]
    pub related_records: Vec<CroquisRecordSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TagGroup {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    #[serde(default)]
    pub group_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TagIndex {
    #[serde(default)]
    pub groups: Vec<TagGroup>,
    #[serde(default)]
    pub tags: Vec<Tag>,
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
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
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
    pub linked: usize,
    #[serde(default)]
    pub assets: Vec<AssetSummary>,
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

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CroquisRecordSummary {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub source_asset_id: Option<String>,
    #[serde(default)]
    pub result_asset_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub step_index: Option<i64>,
    #[serde(default)]
    pub step_name: Option<String>,
    #[serde(default)]
    pub target_duration_seconds: Option<i64>,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub finalized_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CroquisRecordDetail {
    #[serde(flatten)]
    pub record: CroquisRecordSummary,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub source_asset: Option<AssetSummary>,
    #[serde(default)]
    pub result_asset: Option<AssetSummary>,
    #[serde(default)]
    pub tags: Vec<Tag>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveCroquisRecordPayload {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub source_asset_id: Option<String>,
    #[serde(default)]
    pub result_asset_id: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub step_index: Option<i64>,
    #[serde(default)]
    pub step_name: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub target_duration_seconds: Option<i64>,
    #[serde(default)]
    pub tag_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeCroquisRecordPayload {
    pub record_id: String,
    #[serde(default)]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub finalized_at: Option<String>,
    #[serde(default)]
    pub actual_duration_seconds: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCroquisRecordPayload {
    pub record_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCroquisRecordTagsPayload {
    pub record_id: String,
    #[serde(default)]
    pub tag_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionStepPreset {
    pub id: String,
    pub step_order: i64,
    pub name: String,
    #[serde(default)]
    pub default_duration_seconds: Option<i64>,
    #[serde(default)]
    pub auto_tags: Vec<Tag>,
    #[serde(default)]
    pub result_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionPreset {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub steps: Vec<SessionStepPreset>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionPresetStepDraft {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub step_order: i64,
    #[serde(default)]
    pub default_duration_seconds: Option<i64>,
    #[serde(default)]
    pub auto_tag_names: Vec<String>,
    #[serde(default)]
    pub result_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveSessionPresetPayload {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub steps: Vec<SessionPresetStepDraft>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSessionPresetPayload {
    pub preset_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveTagGroupPayload {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTagGroupPayload {
    pub tag_group_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveTagPayload {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub group_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub sort_order: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTagPayload {
    pub tag_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub preset_id: Option<String>,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub finished_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub record_count: i64,
    #[serde(default)]
    pub first_record_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetail {
    pub summary: SessionSummary,
    #[serde(default)]
    pub preset: Option<SessionPreset>,
    #[serde(default)]
    pub records: Vec<CroquisRecordSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerSnapshot {
    #[serde(default)]
    pub virtual_folders: Vec<VirtualFolder>,
    pub all_assets_count: i64,
    pub uncategorized_count: i64,
    #[serde(default)]
    pub recent_records: Vec<CroquisRecordSummary>,
    #[serde(default)]
    pub recent_sessions: Vec<SessionSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub settings: LibrarySettings,
    pub explorer: ExplorerSnapshot,
    #[serde(default)]
    pub session_presets: Vec<SessionPreset>,
    #[serde(default)]
    pub tag_groups: Vec<TagGroup>,
    #[serde(default)]
    pub tags: Vec<Tag>,
}

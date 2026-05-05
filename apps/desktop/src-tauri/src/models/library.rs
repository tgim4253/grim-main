use serde::{Deserialize, Serialize};

use crate::models::{
    folder::VirtualFolder,
    record::CroquisRecordSummary,
    session::SessionPreset,
    tag::{Tag, TagGroup},
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FolderStats {
    pub folder_id: String,
    pub direct_asset_count: i64,
    pub descendant_asset_count: i64,
    pub child_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerSnapshot {
    #[serde(default)]
    pub virtual_folders: Vec<VirtualFolder>,
    #[serde(default)]
    pub folder_stats: Vec<FolderStats>,
    pub all_assets_count: i64,
    pub unassigned_assets_count: i64,
    #[serde(default)]
    pub recent_records: Vec<CroquisRecordSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub explorer: ExplorerSnapshot,
    #[serde(default)]
    pub session_presets: Vec<SessionPreset>,
    #[serde(default)]
    pub tag_groups: Vec<TagGroup>,
    #[serde(default)]
    pub tags: Vec<Tag>,
}

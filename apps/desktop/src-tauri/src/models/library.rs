use serde::{Deserialize, Serialize};

use crate::models::{
    folder::VirtualFolder,
    record::CroquisRecordSummary,
    session::SessionPreset,
    settings::LibrarySettings,
    tag::{Tag, TagGroup},
};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerSnapshot {
    #[serde(default)]
    pub virtual_folders: Vec<VirtualFolder>,
    pub all_assets_count: i64,
    pub uncategorized_count: i64,
    #[serde(default)]
    pub recent_records: Vec<CroquisRecordSummary>,
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

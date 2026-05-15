use serde::{Deserialize, Serialize};

use crate::models::{asset::AssetSummary, tag::Tag};

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
    pub target_duration_seconds: Option<i64>,
    #[serde(default)]
    pub actual_duration_seconds: Option<f64>,
    #[serde(default)]
    pub finished_at: Option<String>,
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
pub struct CroquisRecordResultsSnapshot {
    #[serde(default)]
    pub records: Vec<CroquisRecordSummary>,
    #[serde(default)]
    pub details: Vec<CroquisRecordDetail>,
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
pub struct FinishCroquisRecordPayload {
    pub source_asset_id: String,
    pub title: String,
    #[serde(default)]
    pub target_duration_seconds: Option<i64>,
    pub actual_duration_seconds: f64,
    pub finished_at: String,
    #[serde(default)]
    pub tag_ids: Vec<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordExportImageConfig {
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub use_ratio: bool,
    #[serde(default)]
    pub ratio: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordExportPairLayoutConfig {
    pub source: RecordExportImageConfig,
    pub result: RecordExportImageConfig,
    #[serde(default)]
    pub gap: u32,
    #[serde(default)]
    pub padding: u32,
    #[serde(default)]
    pub horizontal: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordExportGridLayoutConfig {
    #[serde(default)]
    pub h_gap: u32,
    #[serde(default)]
    pub v_gap: u32,
    #[serde(default)]
    pub padding: u32,
    pub limit_per_line: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCroquisRecordsPayload {
    #[serde(default)]
    pub record_ids: Vec<String>,
    pub output_directory: String,
    #[serde(default)]
    pub file_name: Option<String>,
    pub pair_layout: RecordExportPairLayoutConfig,
    pub grid_layout: RecordExportGridLayoutConfig,
    #[serde(default = "default_skip_incomplete_records")]
    pub skip_incomplete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportCroquisRecordsResult {
    pub file_path: String,
    pub exported_count: usize,
    #[serde(default)]
    pub skipped_record_ids: Vec<String>,
}

fn default_skip_incomplete_records() -> bool {
    true
}

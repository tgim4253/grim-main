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

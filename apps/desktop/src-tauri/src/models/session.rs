use serde::{Deserialize, Serialize};

use crate::models::{record::CroquisRecordSummary, tag::Tag};

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

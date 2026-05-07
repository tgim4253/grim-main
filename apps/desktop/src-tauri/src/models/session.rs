use serde::{Deserialize, Serialize};

use crate::models::tag::Tag;

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TimeStepPreset {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub default_duration_seconds: Option<i64>,
    #[serde(default = "default_true")]
    pub auto_advance: bool,
    #[serde(default = "default_true")]
    pub record_save_enabled: bool,
    #[serde(default)]
    pub capture_enabled: bool,
    #[serde(default)]
    pub grayscale_enabled: bool,
    #[serde(default)]
    pub result_required: bool,
    #[serde(default)]
    pub result_save_path: Option<String>,
    #[serde(default)]
    pub auto_tags: Vec<Tag>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionStepPreset {
    pub id: String,
    pub time_step_preset_id: String,
    pub step_order: i64,
    pub time_step: TimeStepPreset,
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
    pub window_width: Option<String>,
    #[serde(default)]
    pub window_height: Option<String>,
    #[serde(default)]
    pub is_shuffle: bool,
    #[serde(default)]
    pub auto_tags: Vec<Tag>,
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
    pub time_step_preset_id: String,
    pub step_order: i64,
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
    pub window_width: Option<String>,
    #[serde(default)]
    pub window_height: Option<String>,
    #[serde(default)]
    pub is_shuffle: bool,
    #[serde(default)]
    pub auto_tag_ids: Vec<String>,
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
pub struct SaveTimeStepPresetPayload {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub default_duration_seconds: Option<i64>,
    #[serde(default = "default_true")]
    pub auto_advance: bool,
    #[serde(default = "default_true")]
    pub record_save_enabled: bool,
    #[serde(default)]
    pub capture_enabled: bool,
    #[serde(default)]
    pub grayscale_enabled: bool,
    #[serde(default)]
    pub result_required: bool,
    #[serde(default)]
    pub result_save_path: Option<String>,
    #[serde(default)]
    pub auto_tag_ids: Vec<String>,
    #[serde(default)]
    pub auto_tag_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteTimeStepPresetPayload {
    pub preset_id: String,
}

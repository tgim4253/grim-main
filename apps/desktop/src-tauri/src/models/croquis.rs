use serde::{Deserialize, Serialize};

fn default_true() -> bool {
    true
}

/// Runtime-only step values used when launching a Croquis session.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CroquisRuntimeStep {
    pub step_id: String,
    #[serde(default)]
    pub time_step_preset_id: Option<String>,
    pub step_order: i64,
    pub name: String,
    #[serde(default)]
    pub default_duration_seconds: Option<i64>,
    #[serde(default)]
    pub tag_ids: Vec<String>,
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
}

/// Payload provided by the renderer to start a Croquis session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisStartPayload {
    #[serde(default)]
    pub asset_ids: Vec<String>,
    pub preset_id: String,
    pub preset_name: String,
    #[serde(default)]
    pub window_width: Option<String>,
    #[serde(default)]
    pub window_height: Option<String>,
    #[serde(default)]
    pub is_shuffle: bool,
    #[serde(default)]
    pub steps: Vec<CroquisRuntimeStep>,
}

/// Metadata describing a single queue item inside a Croquis session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisSessionItem {
    pub item_id: String,
    #[serde(default)]
    pub record_id: Option<String>,
    pub asset_id: String,
    pub title: String,
    #[serde(default)]
    pub tag_ids: Vec<String>,
    pub file_name: String,
    pub hash: String,
    pub base_path: String,
    pub base_width: u32,
    pub base_height: u32,
    pub source_path: String,
    pub step_name: String,
    pub step_index: i64,
    pub target_duration_seconds: Option<i64>,
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
}

/// Persisted Croquis session information shared with the Croquis window.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisSession {
    pub session_id: String,
    pub title: String,
    pub preset_id: String,
    pub preset_name: String,
    #[serde(default)]
    pub window_width: Option<String>,
    #[serde(default)]
    pub window_height: Option<String>,
    #[serde(default)]
    pub is_shuffle: bool,
    pub items: Vec<CroquisSessionItem>,
    pub created_at: String,
}

/// Response returned to the renderer once the Croquis window has been launched.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisStartResponse {
    pub session_id: String,
    pub window_label: String,
}

use serde::{Deserialize, Serialize};

use crate::models::session::SessionPreset;

/// Window sizing preferences supplied by the renderer when launching Croquis.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CroquisWindowOption {
    #[serde(default)]
    pub width: Option<String>,
    #[serde(default)]
    pub height: Option<String>,
}

/// Automatic behaviour toggles for the Croquis session.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CroquisAutoOption {
    #[serde(default)]
    pub is_skip: bool,
}

/// Timer configuration for the Croquis session.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CroquisTimerOption {
    #[serde(default)]
    pub max_time: u32,
}

/// Aggregate Croquis options selected in the renderer.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CroquisOption {
    #[serde(default)]
    pub window: CroquisWindowOption,
    #[serde(default)]
    pub auto: CroquisAutoOption,
    #[serde(default)]
    pub timer: CroquisTimerOption,
    #[serde(default)]
    pub is_capture: bool,
    #[serde(default)]
    pub save_path: String,
    #[serde(default)]
    pub is_gray: bool,
    #[serde(default)]
    pub is_shuffle: bool,
}

/// Named preset that stores a single Croquis option payload.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CroquisPreset {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub option: CroquisOption,
}

/// Collection of Croquis option presets remembered for the library.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CroquisPreferences {
    #[serde(default)]
    pub presets: Vec<CroquisPreset>,
    #[serde(default)]
    pub active_preset_id: String,
}

/// Payload provided by the renderer to start a Croquis session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisStartPayload {
    #[serde(default)]
    pub asset_ids: Vec<String>,
    pub preset: SessionPreset,
    #[serde(default)]
    pub option: CroquisOption,
    #[serde(default)]
    pub save_option: bool,
    #[serde(default)]
    pub preferences: Option<CroquisPreferences>,
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
}

/// Persisted Croquis session information shared with the Croquis window.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisSession {
    pub session_id: String,
    pub title: String,
    pub option: CroquisOption,
    pub preset: SessionPreset,
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

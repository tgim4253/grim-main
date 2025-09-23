use serde::{Deserialize, Serialize};

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

/// Payload provided by the renderer to start a Croquis session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisStartPayload {
    pub moa_id: String,
    pub option: CroquisOption,
    pub image_hashes: Vec<String>,
    #[serde(default)]
    pub save_option: bool,
}

/// Metadata describing an ensured Croquis base image.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisSessionImage {
    pub hash: String,
    pub base_path: String,
    pub base_width: u32,
    pub base_height: u32,
    pub source_path: String,
}

/// Persisted Croquis session information shared with the Croquis window.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisSession {
    pub session_id: String,
    pub moa_id: String,
    pub option: CroquisOption,
    pub images: Vec<CroquisSessionImage>,
    pub created_at: String,
}

/// Response returned to the renderer once the Croquis window has been launched.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisStartResponse {
    pub session_id: String,
    pub window_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisCaptureStartPayload {
    pub session_id: String,
    pub image_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisCaptureStartResponse {
    pub capture_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisCaptureContext {
    pub capture_id: String,
    pub session_id: String,
    pub image_hash: String,
    pub moa_id: String,
    pub save_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisCaptureRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisCaptureMonitor {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisCapturePreviewPayload {
    pub capture_id: String,
    pub rect: CroquisCaptureRect,
    pub monitor: CroquisCaptureMonitor,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisCapturePreview {
    pub preview_path: String,
    pub rect: CroquisCaptureRect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CroquisCaptureConfirmResponse {
    pub file_path: String,
    pub file_name: String,
}

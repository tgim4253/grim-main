use serde::{Deserialize, Serialize};

/// Information required to launch or confirm a capture workflow.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CaptureContext {
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub record_id: Option<String>,
    #[serde(default)]
    pub asset_id: Option<String>,
    #[serde(default)]
    pub target_seconds: Option<i64>,
    #[serde(default)]
    pub actual_seconds: Option<f64>,
    #[serde(default)]
    pub result_save_path: Option<String>,
}

pub type CaptureOverlayPayload = CaptureContext;

/// Logical monitor bounds reported by the renderer when preparing a capture.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureMonitor {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

/// Rectangle describing the selection region to capture.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Payload provided when requesting a capture preview.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePreviewPayload {
    pub rect: CaptureRect,
    pub monitor: CaptureMonitor,
}

/// Data returned to the renderer for preview display.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePreview {
    pub base_url: String,
}

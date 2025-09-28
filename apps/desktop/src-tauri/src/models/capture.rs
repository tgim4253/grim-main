use serde::{Deserialize, Serialize};

use crate::models::connection::RelationType;

fn default_forward_link() -> Option<RelationType> {
    Some(RelationType::RelativeImage)
}

fn default_reverse_link() -> Option<RelationType> {
    Some(RelationType::RelativeImage)
}

/// Information required to launch or confirm a capture workflow.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CaptureContext {
    #[serde(default)]
    pub session_id: Option<String>,
    pub source_hash: String,
    pub moa_id: String,
    #[serde(default)]
    pub save_path: String,
    #[serde(default = "default_forward_link")]
    pub link_type_forward: Option<RelationType>,
    #[serde(default = "default_reverse_link")]
    pub link_type_reverse: Option<RelationType>,
}

pub type CaptureOverlayPayload = CaptureContext;

/// Monitor bounds reported by the renderer when preparing a capture.
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

use serde::{Deserialize, Serialize};

/// Persisted crop metadata associated with a crop node.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageCrop {
    pub node_id: String,
    pub origin_hash: String,
    pub start_x: f64,
    pub start_y: f64,
    pub width: f64,
    pub height: f64,
    pub reference_width: Option<i64>,
    pub reference_height: Option<i64>,
    pub is_relative: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// Rectangle describing the crop bounds.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropRectangle {
    pub start_x: f64,
    pub start_y: f64,
    pub width: f64,
    pub height: f64,
}

/// Payload provided by the renderer to create a crop node.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateImageCropPayload {
    pub origin_node_id: String,
    pub origin_hash: String,
    pub rect: CropRectangle,
    pub reference_width: Option<i64>,
    pub reference_height: Option<i64>,
    #[serde(default)]
    pub is_relative: bool,
}

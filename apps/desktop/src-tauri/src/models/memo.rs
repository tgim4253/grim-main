use serde::{Deserialize, Serialize};

use crate::models::{crop::CropRectangle, graph::GraphResponse};

/// Persisted memo associated with a memo node.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeMemo {
    pub node_id: String,
    #[serde(default)]
    pub text: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Payload to create a memo optionally linked to a new crop.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMemoPayload {
    pub target_node_id: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub crop: Option<CreateMemoCropPayload>,
    #[serde(default)]
    pub origin_hash: Option<String>,
}

/// Optional crop details when creating a memo.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMemoCropPayload {
    pub rect: CropRectangle,
    pub reference_width: Option<i64>,
    pub reference_height: Option<i64>,
    #[serde(default)]
    pub is_relative: bool,
}

/// Payload to update the memo text content.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemoPayload {
    pub node_id: String,
    #[serde(default)]
    pub text: String,
}

/// Result returned after creating a memo node.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMemoResult {
    pub memo: NodeMemo,
    pub graph: GraphResponse,
}

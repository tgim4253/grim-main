use serde::{Deserialize, Serialize};

use crate::models::file::FileContent;

/// Payload for creating a new document file within a workspace.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentPayload {
    pub moa_id: String,
    pub anchor_node_id: String,
    #[serde(default)]
    pub base_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadDocumentPayload {
    pub moa_id: String,
    pub node_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocumentPayload {
    pub moa_id: String,
    pub node_id: String,
    pub markdown: String,
    #[serde(default)]
    pub base_name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentData {
    pub node_id: String,
    pub file_name: String,
    pub markdown: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentUpdateResult {
    pub file: FileContent,
}

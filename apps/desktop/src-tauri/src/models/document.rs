use serde::Deserialize;

/// Payload for creating a new document file within a workspace.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentPayload {
    pub moa_id: String,
    pub anchor_node_id: String,
    #[serde(default)]
    pub base_name: Option<String>,
}

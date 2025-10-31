use crate::{
    models::{document::CreateDocumentPayload, graph::GraphResponse},
    services::document_service,
};

/// Create a markdown document in the workspace document directory and link it to the anchor node.
#[tauri::command]
pub async fn create_document(
    payload: CreateDocumentPayload,
) -> Result<GraphResponse, String> {
    document_service::create_document(payload)
        .await
        .map_err(|err| err.to_string())
}

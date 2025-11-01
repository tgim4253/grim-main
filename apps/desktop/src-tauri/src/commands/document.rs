use crate::{
    models::{
        document::{
            CreateDocumentPayload, DocumentData, DocumentUpdateResult,
            LoadDocumentPayload, UpdateDocumentPayload,
        },
        graph::GraphResponse,
    },
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

/// Load an existing markdown document and return its contents.
#[tauri::command]
pub async fn load_document(
    payload: LoadDocumentPayload,
) -> Result<DocumentData, String> {
    document_service::load_document(payload)
        .await
        .map_err(|err| err.to_string())
}

/// Persist document content changes and optional rename.
#[tauri::command]
pub async fn update_document(
    payload: UpdateDocumentPayload,
) -> Result<DocumentUpdateResult, String> {
    document_service::update_document(payload)
        .await
        .map_err(|err| err.to_string())
}

use crate::{
    models::memo::{
        CreateMemoPayload, CreateMemoResult, NodeMemo, UpdateMemoPayload,
    },
    services::memo_service,
};

#[tauri::command]
pub async fn create_memo(
    moa_id: String,
    payload: CreateMemoPayload,
) -> Result<CreateMemoResult, String> {
    memo_service::create_memo(&moa_id, payload)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn update_memo_text(
    moa_id: String,
    payload: UpdateMemoPayload,
) -> Result<NodeMemo, String> {
    memo_service::update_memo_text(&moa_id, payload)
        .await
        .map_err(|err| err.to_string())
}

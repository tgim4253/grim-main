use crate::{models::file::FolderData, services::file_service};
use anyhow::Result;

#[tauri::command]
pub async fn create_folder(
    app_handle: tauri::AppHandle,
    moa_id: String,
    data: FolderData,
) -> Result<(), String> {
    file_service::create_folder(app_handle, moa_id, data).await.map_err(|e| e.to_string())?;
    Ok(())
}

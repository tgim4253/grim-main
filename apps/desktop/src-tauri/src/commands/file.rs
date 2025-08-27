use crate::{
    models::file::FolderData,
    services::file_service::{self, first_mount_folder},
};
use anyhow::Result;

#[tauri::command]
pub async fn create_folder(
    app_handle: tauri::AppHandle,
    moa_id: String,
    data: FolderData,
) -> Result<(), String> {
    let node = file_service::create_folder(moa_id.clone(), data.clone())
        .await
        .map_err(|e| e.to_string())?;

    if let Some(path) = data.path {
        if !path.is_empty() {
            first_mount_folder(moa_id.clone().clone(), node, path)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

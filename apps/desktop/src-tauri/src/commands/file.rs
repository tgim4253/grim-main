use std::path::PathBuf;

use crate::{
    models::file::{FolderData, FolderPreview, ThumbRequest, ThumbResponse},
    services::file_service::{
        self, collect_folder_preview, first_mount_folder, get_thumbs,
    },
};
#[tauri::command]
/// Create a virtual folder and optionally mount the provided filesystem path.
pub async fn create_folder(
    app_handle: tauri::AppHandle,
    moa_id: String,
    data: FolderData,
) -> Result<(), String> {
    let node = file_service::create_folder(moa_id.clone(), data.clone())
        .await
        .map_err(|e| e.to_string())?;

    if let Some(path) = data.path.as_ref().filter(|path| !path.is_empty()) {
        first_mount_folder(
            app_handle,
            moa_id.clone(),
            node,
            path.clone(),
            data.selection.clone(),
        )
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
/// Fetch cached thumbnails and queue any missing renders.
pub async fn get_thumbnails(
    app_handle: tauri::AppHandle,
    moa_id: String,
    data: ThumbRequest,
) -> Result<ThumbResponse, String> {
    let response = get_thumbs(&app_handle, moa_id, data)
        .await
        .map_err(|e| e.to_string())?;

    Ok(response)
}

#[tauri::command]
/// Produce a preview of the selected folder prior to import.
pub async fn preview_folder_import(
    path: String,
) -> Result<FolderPreview, String> {
    let path = PathBuf::from(path);
    collect_folder_preview(path.as_path()).await.map_err(|e| e.to_string())
}

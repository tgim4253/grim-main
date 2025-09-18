use crate::{
    models::file::{FolderData, ThumbRequest, ThumbResponse},
    services::file_service::{self, first_mount_folder, get_thumbs},
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
        first_mount_folder(app_handle, moa_id.clone(), node, path.clone())
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

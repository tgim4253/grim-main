use std::path::PathBuf;

use crate::{
    models::file::{
        FolderData, FolderOptionUpdatePayload, FolderPreview, ThumbRequest,
        ThumbResponse,
    },
    services::file_service::{
        self, clear_base_thumb_cache, clear_derived_thumb_cache,
        collect_folder_preview, collect_thumb_cache_usage, first_mount_folder,
        get_thumbs, sync_virtual_folder, update_virtual_folder_options,
        ThumbCacheUsage,
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
            data.expected_bytes,
            data.expected_files,
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

#[tauri::command]
/// Return usage statistics for cached base and derived thumbnails.
pub async fn get_thumbnail_usage(
    app_handle: tauri::AppHandle,
) -> Result<ThumbCacheUsage, String> {
    collect_thumb_cache_usage(&app_handle).await.map_err(|e| e.to_string())
}

#[tauri::command]
/// Remove cached derived thumbnails (keeps base cache intact).
pub async fn clear_thumbnail_cache(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    clear_derived_thumb_cache(&app_handle).await.map_err(|e| e.to_string())
}

#[tauri::command]
/// Remove cached base thumbnails forcing regeneration on demand.
pub async fn clear_base_thumbnail_cache(
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    clear_base_thumb_cache(&app_handle).await.map_err(|e| e.to_string())
}

#[tauri::command]
/// Trigger a manual sync for a mounted virtual folder.
pub async fn sync_folder_mount(
    app_handle: tauri::AppHandle,
    moa_id: String,
    virtual_node_id: String,
) -> Result<(), String> {
    sync_virtual_folder(&app_handle, &moa_id, &virtual_node_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
/// Update folder mount options such as path, recursion, and sync behaviour.
pub async fn update_folder_mount_options(
    moa_id: String,
    virtual_node_id: String,
    options: FolderOptionUpdatePayload,
) -> Result<(), String> {
    update_virtual_folder_options(&moa_id, &virtual_node_id, options)
        .await
        .map_err(|e| e.to_string())
}

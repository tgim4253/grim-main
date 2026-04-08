use tauri::State;

use crate::{
    models::library::{
        DeleteVirtualFolderPayload, SaveVirtualFolderPayload,
        SaveVirtualFolderResult, VirtualFolder,
    },
    services::LibraryService,
};

#[tauri::command]
pub async fn save_virtual_folder(
    payload: SaveVirtualFolderPayload,
    library_service: State<'_, LibraryService>,
) -> Result<SaveVirtualFolderResult, String> {
    library_service
        .save_virtual_folder(payload)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn delete_virtual_folder(
    payload: DeleteVirtualFolderPayload,
    library_service: State<'_, LibraryService>,
) -> Result<Vec<VirtualFolder>, String> {
    library_service
        .delete_virtual_folder(payload)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn search_virtual_folders(
    query: String,
    library_service: State<'_, LibraryService>,
) -> Result<Vec<VirtualFolder>, String> {
    library_service
        .search_virtual_folders(&query)
        .await
        .map_err(|err| err.to_string())
}

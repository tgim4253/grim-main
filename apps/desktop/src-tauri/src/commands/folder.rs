use tauri::State;

use crate::{
    errors::{CommandResult, IntoCommandResult},
    models::folder::{
        DeleteVirtualFolderPayload, SaveVirtualFolderPayload,
        SaveVirtualFolderResult, VirtualFolder,
    },
    services::FolderService,
};

#[tauri::command]
pub async fn save_virtual_folder(
    payload: SaveVirtualFolderPayload,
    folder_service: State<'_, FolderService>,
) -> CommandResult<SaveVirtualFolderResult> {
    folder_service.save_virtual_folder(payload).await.into_command()
}

#[tauri::command]
pub async fn delete_virtual_folder(
    payload: DeleteVirtualFolderPayload,
    folder_service: State<'_, FolderService>,
) -> CommandResult<Vec<VirtualFolder>> {
    folder_service.delete_virtual_folder(payload).await.into_command()
}

#[tauri::command]
pub async fn search_virtual_folders(
    query: String,
    folder_service: State<'_, FolderService>,
) -> CommandResult<Vec<VirtualFolder>> {
    folder_service.search_virtual_folders(&query).await.into_command()
}

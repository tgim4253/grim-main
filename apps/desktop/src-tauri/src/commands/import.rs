use tauri::State;

use crate::{
    errors::{CommandResult, IntoCommandResult},
    models::asset::{
        ImportPreviewResult, ImportRemoteImagesRequest, ImportRequest,
        ImportResult,
    },
    services::AssetService,
};

#[tauri::command]
pub async fn preview_import_images(
    payload: ImportRequest,
    asset_service: State<'_, AssetService>,
) -> CommandResult<ImportPreviewResult> {
    asset_service.preview_import_images(payload).await.into_command()
}

#[tauri::command]
pub async fn import_images(
    payload: ImportRequest,
    asset_service: State<'_, AssetService>,
) -> CommandResult<ImportResult> {
    asset_service.import_images(payload).await.into_command()
}

#[tauri::command]
pub async fn import_remote_images(
    payload: ImportRemoteImagesRequest,
    asset_service: State<'_, AssetService>,
) -> CommandResult<ImportResult> {
    asset_service.import_remote_images(payload).await.into_command()
}

use tauri::State;

use crate::{
    errors::{CommandResult, IntoCommandResult},
    models::asset::{ImportRequest, ImportResult},
    services::AssetService,
};

#[tauri::command]
pub async fn import_images(
    payload: ImportRequest,
    asset_service: State<'_, AssetService>,
) -> CommandResult<ImportResult> {
    asset_service.import_images(payload).await.into_command()
}

#[tauri::command]
pub async fn link_external_files(
    payload: ImportRequest,
    asset_service: State<'_, AssetService>,
) -> CommandResult<ImportResult> {
    asset_service.link_external_files(payload).await.into_command()
}

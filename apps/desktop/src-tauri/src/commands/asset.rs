use tauri::State;

use crate::{
    errors::{CommandResult, IntoCommandResult},
    models::asset::{
        AssetDetail, AssetListSource, AssetSummary, UpdateAssetFoldersPayload,
    },
    services::AssetService,
};

#[tauri::command]
pub async fn list_assets(
    source: AssetListSource,
    asset_service: State<'_, AssetService>,
) -> CommandResult<Vec<AssetSummary>> {
    asset_service.list_assets(source).await.into_command()
}

#[tauri::command]
pub async fn get_asset_detail(
    asset_id: String,
    asset_service: State<'_, AssetService>,
) -> CommandResult<AssetDetail> {
    asset_service.get_asset(&asset_id).await.into_command()
}

#[tauri::command]
pub async fn update_asset_folders(
    payload: UpdateAssetFoldersPayload,
    asset_service: State<'_, AssetService>,
) -> CommandResult<AssetDetail> {
    asset_service.update_asset_folders(payload).await.into_command()
}

#[tauri::command]
pub async fn reveal_path(
    path: String,
    asset_service: State<'_, AssetService>,
) -> CommandResult<()> {
    asset_service.reveal_path(std::path::Path::new(&path)).await.into_command()
}

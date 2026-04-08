use tauri::State;

use crate::{
    models::library::{
        AssetDetail, AssetListSource, AssetSummary, UpdateAssetFoldersPayload,
        UpdateAssetTagsPayload,
    },
    services::LibraryService,
};

#[tauri::command]
pub async fn list_assets(
    source: AssetListSource,
    library_service: State<'_, LibraryService>,
) -> Result<Vec<AssetSummary>, String> {
    library_service.list_assets(source).await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn get_asset_detail(
    asset_id: String,
    library_service: State<'_, LibraryService>,
) -> Result<AssetDetail, String> {
    library_service.get_asset(&asset_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn update_asset_folders(
    payload: UpdateAssetFoldersPayload,
    library_service: State<'_, LibraryService>,
) -> Result<AssetDetail, String> {
    library_service
        .update_asset_folders(payload)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn update_asset_tags(
    payload: UpdateAssetTagsPayload,
    library_service: State<'_, LibraryService>,
) -> Result<AssetDetail, String> {
    library_service
        .update_asset_tags(payload)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn reveal_path(
    path: String,
    library_service: State<'_, LibraryService>,
) -> Result<(), String> {
    library_service
        .reveal_path(std::path::Path::new(&path))
        .await
        .map_err(|err| err.to_string())
}

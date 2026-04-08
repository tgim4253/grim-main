use tauri::State;

use crate::{
    models::{
        croquis::CroquisPreferences,
        library::{LibrarySettings, LibrarySnapshot},
    },
    services::{CroquisService, LibraryService},
};

#[tauri::command]
pub async fn load_library_snapshot(
    library_service: State<'_, LibraryService>,
) -> Result<LibrarySnapshot, String> {
    library_service.load_snapshot().await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn load_library_settings(
    library_service: State<'_, LibraryService>,
) -> Result<LibrarySettings, String> {
    library_service.load_settings().await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn save_library_settings(
    payload: LibrarySettings,
    library_service: State<'_, LibraryService>,
) -> Result<LibrarySettings, String> {
    library_service.save_settings(payload).await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn load_croquis_preferences(
    croquis_service: State<'_, CroquisService>,
) -> Result<Option<CroquisPreferences>, String> {
    croquis_service.load_preferences().await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn save_croquis_preferences(
    preferences: CroquisPreferences,
    croquis_service: State<'_, CroquisService>,
) -> Result<CroquisPreferences, String> {
    croquis_service
        .save_preferences(&preferences)
        .await
        .map_err(|err| err.to_string())
}

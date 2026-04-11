use tauri::State;

use crate::{
    errors::{CommandResult, IntoCommandResult},
    models::{
        croquis::CroquisPreferences, library::LibrarySnapshot,
        settings::LibrarySettings,
    },
    services::{CroquisService, LibraryService, SettingsService},
};

#[tauri::command]
pub async fn load_library_snapshot(
    library_service: State<'_, LibraryService>,
) -> CommandResult<LibrarySnapshot> {
    library_service.load_snapshot().await.into_command()
}

#[tauri::command]
pub async fn load_library_settings(
    settings_service: State<'_, SettingsService>,
) -> CommandResult<LibrarySettings> {
    settings_service.load_settings().await.into_command()
}

#[tauri::command]
pub async fn save_library_settings(
    payload: LibrarySettings,
    settings_service: State<'_, SettingsService>,
) -> CommandResult<LibrarySettings> {
    settings_service.save_settings(payload).await.into_command()
}

#[tauri::command]
pub async fn load_croquis_preferences(
    croquis_service: State<'_, CroquisService>,
) -> CommandResult<Option<CroquisPreferences>> {
    croquis_service.load_preferences().await.into_command()
}

#[tauri::command]
pub async fn save_croquis_preferences(
    preferences: CroquisPreferences,
    croquis_service: State<'_, CroquisService>,
) -> CommandResult<CroquisPreferences> {
    croquis_service.save_preferences(&preferences).await.into_command()
}

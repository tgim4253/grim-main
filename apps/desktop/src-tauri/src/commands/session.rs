use tauri::State;

use crate::{
    models::{
        croquis::{CroquisSession, CroquisStartPayload, CroquisStartResponse},
        library::{
            DeleteSessionPresetPayload, SaveSessionPresetPayload,
            SessionDetail, SessionPreset, SessionSummary,
        },
    },
    services::{CroquisService, LibraryService},
};

#[tauri::command]
pub async fn list_recent_sessions(
    limit: Option<i64>,
    library_service: State<'_, LibraryService>,
) -> Result<Vec<SessionSummary>, String> {
    library_service
        .list_recent_sessions(limit.unwrap_or(24))
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn get_session_detail(
    session_id: String,
    library_service: State<'_, LibraryService>,
) -> Result<SessionDetail, String> {
    library_service
        .get_session_detail(&session_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn list_session_presets(
    library_service: State<'_, LibraryService>,
) -> Result<Vec<SessionPreset>, String> {
    library_service.list_session_presets().await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn save_session_preset(
    payload: SaveSessionPresetPayload,
    library_service: State<'_, LibraryService>,
) -> Result<Vec<SessionPreset>, String> {
    library_service
        .save_session_preset(payload)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn delete_session_preset(
    payload: DeleteSessionPresetPayload,
    library_service: State<'_, LibraryService>,
) -> Result<Vec<SessionPreset>, String> {
    library_service
        .delete_session_preset(payload)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn start_croquis_session(
    app_handle: tauri::AppHandle,
    payload: CroquisStartPayload,
    croquis_service: State<'_, CroquisService>,
) -> Result<CroquisStartResponse, String> {
    croquis_service
        .start_session(&app_handle, payload)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn load_croquis_session(
    session_id: String,
    croquis_service: State<'_, CroquisService>,
) -> Result<Option<CroquisSession>, String> {
    Ok(croquis_service.load_session(&session_id).await)
}

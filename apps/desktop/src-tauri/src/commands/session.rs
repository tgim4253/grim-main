use tauri::State;

use crate::{
    errors::{CommandResult, IntoCommandResult},
    models::{
        croquis::{CroquisSession, CroquisStartPayload, CroquisStartResponse},
        session::{
            DeleteSessionPresetPayload, DeleteTimeStepPresetPayload,
            SaveSessionPresetPayload, SaveTimeStepPresetPayload, SessionPreset,
            TimeStepPreset,
        },
    },
    services::{CroquisService, SessionService},
};

#[tauri::command]
pub async fn list_session_presets(
    session_service: State<'_, SessionService>,
) -> CommandResult<Vec<SessionPreset>> {
    session_service.list_session_presets().await.into_command()
}

#[tauri::command]
pub async fn list_time_step_presets(
    session_service: State<'_, SessionService>,
) -> CommandResult<Vec<TimeStepPreset>> {
    session_service.list_time_step_presets().await.into_command()
}

#[tauri::command]
pub async fn save_session_preset(
    payload: SaveSessionPresetPayload,
    session_service: State<'_, SessionService>,
) -> CommandResult<Vec<SessionPreset>> {
    session_service.save_session_preset(payload).await.into_command()
}

#[tauri::command]
pub async fn delete_session_preset(
    payload: DeleteSessionPresetPayload,
    session_service: State<'_, SessionService>,
) -> CommandResult<Vec<SessionPreset>> {
    session_service.delete_session_preset(payload).await.into_command()
}

#[tauri::command]
pub async fn save_time_step_preset(
    payload: SaveTimeStepPresetPayload,
    session_service: State<'_, SessionService>,
) -> CommandResult<Vec<TimeStepPreset>> {
    session_service.save_time_step_preset(payload).await.into_command()
}

#[tauri::command]
pub async fn delete_time_step_preset(
    payload: DeleteTimeStepPresetPayload,
    session_service: State<'_, SessionService>,
) -> CommandResult<Vec<TimeStepPreset>> {
    session_service.delete_time_step_preset(payload).await.into_command()
}

#[tauri::command]
pub async fn start_croquis_session(
    app_handle: tauri::AppHandle,
    payload: CroquisStartPayload,
    croquis_service: State<'_, CroquisService>,
) -> CommandResult<CroquisStartResponse> {
    croquis_service.start_session(&app_handle, payload).await.into_command()
}

#[tauri::command]
pub async fn load_croquis_session(
    session_id: String,
    croquis_service: State<'_, CroquisService>,
) -> CommandResult<Option<CroquisSession>> {
    Ok(croquis_service.take_session(&session_id).await)
}

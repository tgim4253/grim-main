use crate::{
    models::croquis::{
        CaptureOverlayPayload, CroquisCaptureContext, CroquisCaptureMonitor,
        CroquisCapturePreview, CroquisCaptureRect, CroquisPreferences,
        CroquisSession, CroquisStartPayload, CroquisStartResponse,
    },
    services::croquis_service,
};

/// Ensure Croquis assets are ready and launch the dedicated Croquis window.
#[tauri::command]
pub async fn start_croquis_session(
    app_handle: tauri::AppHandle,
    payload: CroquisStartPayload,
) -> Result<CroquisStartResponse, String> {
    croquis_service::start_session(&app_handle, payload)
        .await
        .map_err(|err| err.to_string())
}

/// Fetch a prepared Croquis session by identifier for the Croquis window.
#[tauri::command]
pub async fn load_croquis_session(
    session_id: String,
) -> Result<Option<CroquisSession>, String> {
    Ok(croquis_service::load_session(&session_id).await)
}

/// Load persisted Croquis preferences for the provided workspace if available.
#[tauri::command]
pub async fn load_croquis_option(
    moa_id: String,
) -> Result<Option<CroquisPreferences>, String> {
    croquis_service::load_preferences(&moa_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn open_croquis_capture_overlay(
    app_handle: tauri::AppHandle,
    payload: CaptureOverlayPayload,
) -> Result<(), String> {
    croquis_service::open_croquis_capture_overlay(&app_handle, payload)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

/// Capture the selected monitor region and return a preview as a data URL.
#[tauri::command]
pub async fn render_croquis_capture_preview(
    rect: CroquisCaptureRect,
    monitor: CroquisCaptureMonitor,
) -> Result<CroquisCapturePreview, String> {
    croquis_service::render_capture_preview(rect, monitor)
        .await
        .map_err(|err| err.to_string())
}

/// Persist a confirmed Croquis capture to disk and register it in the graph.
#[tauri::command]
pub async fn confirm_croquis_capture(
    base_url: String,
    context: CroquisCaptureContext,
) -> Result<(), String> {
    croquis_service::confirm_capture(base_url, context)
        .await
        .map_err(|err| err.to_string())
}

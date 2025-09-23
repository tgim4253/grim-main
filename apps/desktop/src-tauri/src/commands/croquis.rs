use crate::{
    models::croquis::{
        CroquisCaptureConfirmResponse, CroquisCaptureContext,
        CroquisCapturePreview, CroquisCapturePreviewPayload,
        CroquisCaptureStartPayload, CroquisCaptureStartResponse, CroquisOption,
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

/// Load persisted Croquis options for the provided workspace if available.
#[tauri::command]
pub async fn load_croquis_option(
    moa_id: String,
) -> Result<Option<CroquisOption>, String> {
    croquis_service::load_option(&moa_id).await.map_err(|err| err.to_string())
}

/// Initiate the capture overlay for the active Croquis session.
#[tauri::command]
pub async fn start_croquis_capture(
    app_handle: tauri::AppHandle,
    payload: CroquisCaptureStartPayload,
) -> Result<CroquisCaptureStartResponse, String> {
    croquis_service::start_capture(&app_handle, payload)
        .await
        .map_err(|err| err.to_string())
}

/// Fetch the active capture context used by the overlay window.
#[tauri::command]
pub async fn load_croquis_capture_context(
    capture_id: String,
) -> Result<Option<CroquisCaptureContext>, String> {
    Ok(croquis_service::load_capture_context(&capture_id).await)
}

/// Capture a preview image for the provided selection rectangle.
#[tauri::command]
pub async fn render_croquis_capture_preview(
    app_handle: tauri::AppHandle,
    payload: CroquisCapturePreviewPayload,
) -> Result<CroquisCapturePreview, String> {
    croquis_service::render_capture_preview(&app_handle, payload)
        .await
        .map_err(|err| err.to_string())
}

/// Finalise the capture by saving the preview to disk and ingesting it.
#[tauri::command]
pub async fn confirm_croquis_capture(
    app_handle: tauri::AppHandle,
    capture_id: String,
) -> Result<CroquisCaptureConfirmResponse, String> {
    croquis_service::confirm_capture(&app_handle, &capture_id)
        .await
        .map_err(|err| err.to_string())
}

/// Cancel the active capture flow and close the overlay window.
#[tauri::command]
pub async fn cancel_croquis_capture(
    app_handle: tauri::AppHandle,
    capture_id: String,
) -> Result<(), String> {
    croquis_service::cancel_capture(&app_handle, &capture_id)
        .await
        .map_err(|err| err.to_string())
}

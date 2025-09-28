use crate::{
    models::capture::{
        CaptureContext, CaptureMonitor, CaptureOverlayPayload, CapturePreview,
        CapturePreviewPayload, CaptureRect,
    },
    services::capture_service,
};

/// Launch the shared capture overlay.
#[tauri::command]
pub async fn open_capture_overlay(
    app_handle: tauri::AppHandle,
    payload: CaptureOverlayPayload,
) -> Result<(), String> {
    capture_service::open_capture_overlay(&app_handle, payload)
        .await
        .map_err(|err| err.to_string())?;

    Ok(())
}

/// Capture the selected monitor region and return a preview as a data URL.
#[tauri::command]
pub async fn render_capture_preview(
    rect: CaptureRect,
    monitor: CaptureMonitor,
) -> Result<CapturePreview, String> {
    capture_service::render_capture_preview(rect, monitor)
        .await
        .map_err(|err| err.to_string())
}

/// Persist a confirmed capture to disk and register it in the graph.
#[tauri::command]
pub async fn confirm_capture(
    app_handle: tauri::AppHandle,
    base_url: String,
    context: CaptureContext,
) -> Result<(), String> {
    capture_service::confirm_capture(&app_handle, base_url, context)
        .await
        .map_err(|err| err.to_string())
}

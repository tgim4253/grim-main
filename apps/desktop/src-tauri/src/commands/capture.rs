use tauri::State;

use crate::{
    models::capture::{
        CaptureContext, CaptureMonitor, CaptureOverlayPayload, CapturePreview,
        CaptureRect,
    },
    services::CaptureService,
};

#[tauri::command]
pub async fn open_capture_overlay(
    app_handle: tauri::AppHandle,
    payload: CaptureOverlayPayload,
    capture_service: State<'_, CaptureService>,
) -> Result<(), String> {
    capture_service
        .open_capture_overlay(&app_handle, payload)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn render_capture_preview(
    rect: CaptureRect,
    monitor: CaptureMonitor,
    capture_service: State<'_, CaptureService>,
) -> Result<CapturePreview, String> {
    capture_service
        .render_capture_preview(rect, monitor)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn confirm_capture(
    app_handle: tauri::AppHandle,
    base_url: String,
    context: CaptureContext,
    capture_service: State<'_, CaptureService>,
) -> Result<(), String> {
    capture_service
        .confirm_capture(&app_handle, base_url, context)
        .await
        .map_err(|err| err.to_string())
}

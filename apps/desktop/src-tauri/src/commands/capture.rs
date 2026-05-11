use tauri::{State, WebviewWindow};

use crate::{
    errors::{CommandResult, IntoCommandResult},
    models::capture::{
        CaptureContext, CaptureMonitor, CaptureOverlayPayload, CapturePreview,
        CaptureRect,
    },
    services::CaptureService,
};

#[tauri::command]
pub async fn open_capture_overlay(
    app_handle: tauri::AppHandle,
    window: WebviewWindow,
    payload: CaptureOverlayPayload,
    capture_service: State<'_, CaptureService>,
) -> CommandResult<()> {
    capture_service
        .open_capture_overlay(&app_handle, &window, payload)
        .await
        .into_command()
}

#[tauri::command]
pub async fn render_capture_preview(
    rect: CaptureRect,
    monitor: CaptureMonitor,
    capture_service: State<'_, CaptureService>,
) -> CommandResult<CapturePreview> {
    capture_service.render_capture_preview(rect, monitor).await.into_command()
}

#[tauri::command]
pub async fn confirm_capture(
    app_handle: tauri::AppHandle,
    base_url: String,
    context: CaptureContext,
    capture_service: State<'_, CaptureService>,
) -> CommandResult<()> {
    capture_service
        .confirm_capture(&app_handle, base_url, context)
        .await
        .into_command()
}

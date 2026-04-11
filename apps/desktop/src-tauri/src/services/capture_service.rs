use std::io::Cursor;

use anyhow::{anyhow, bail, Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use image::{DynamicImage, ImageFormat, RgbaImage};
use screenshots::Screen;
use tauri::Emitter;

use crate::{
    app_launcher,
    models::{
        capture::{
            CaptureContext, CaptureMonitor, CaptureOverlayPayload,
            CapturePreview, CaptureRect,
        },
        record::SaveCroquisRecordPayload,
    },
    services::{AssetService, RecordService},
    utils::file_ops::decode_data_url,
};

#[derive(Clone)]
pub struct CaptureService {
    asset_service: AssetService,
    record_service: RecordService,
}

impl CaptureService {
    pub fn new(
        asset_service: AssetService,
        record_service: RecordService,
    ) -> Self {
        Self { asset_service, record_service }
    }

    pub async fn open_capture_overlay(
        &self,
        app_handle: &tauri::AppHandle,
        payload: CaptureOverlayPayload,
    ) -> Result<()> {
        open_capture_overlay(app_handle, payload).await
    }

    pub async fn render_capture_preview(
        &self,
        rect: CaptureRect,
        monitor: CaptureMonitor,
    ) -> Result<CapturePreview> {
        render_capture_preview(rect, monitor).await
    }

    pub async fn confirm_capture(
        &self,
        app_handle: &tauri::AppHandle,
        base_url: String,
        context: CaptureContext,
    ) -> Result<()> {
        self.confirm_capture_inner(app_handle, base_url, context).await
    }

    async fn confirm_capture_inner(
        &self,
        app_handle: &tauri::AppHandle,
        base_url: String,
        context: CaptureContext,
    ) -> Result<()> {
        if base_url.is_empty() {
            bail!("Capture payload is empty");
        }

        let (bytes, extension) = decode_data_url(&base_url)?;
        let extension = extension.unwrap_or_else(|| "png".to_string());
        if let Some(record_id) = context.record_id.as_deref() {
            let _ = self.record_service.get_record(record_id).await?;
        }
        let file_name = context
            .record_id
            .as_ref()
            .map(|record_id| format!("capture-{record_id}.{extension}"))
            .unwrap_or_else(|| {
                format!(
                    "capture-{}.{}",
                    chrono::Local::now().format("%Y%m%d-%H%M%S"),
                    extension
                )
            });

        let result_asset = self
            .asset_service
            .import_capture_result(&bytes, &file_name)
            .await?;

        let record = match context.record_id.as_deref() {
            Some(record_id) => {
                self.record_service
                    .attach_result_asset(
                        record_id,
                        &result_asset.id,
                        context.actual_seconds,
                    )
                    .await?
            }
            None => {
                self.record_service
                    .save_record(SaveCroquisRecordPayload {
                        id: None,
                        source_asset_id: context.asset_id.clone(),
                        result_asset_id: Some(result_asset.id.clone()),
                        session_id: context.session_id.clone(),
                        step_index: None,
                        step_name: Some("Capture".to_string()),
                        title: Some("Captured Result".to_string()),
                        note: None,
                        target_duration_seconds: context.target_seconds,
                        tag_ids: Vec::new(),
                    })
                    .await?
            }
        };

        #[derive(serde::Serialize, Clone)]
        #[serde(rename_all = "camelCase")]
        struct CaptureCompletedPayload {
            record_id: String,
            result_asset_id: String,
        }

        let payload = CaptureCompletedPayload {
            record_id: record.record.id,
            result_asset_id: result_asset.id,
        };

        app_handle.emit("capture://completed", payload).map_err(|err| {
            anyhow!("Failed to emit capture completion event: {err}")
        })?;

        Ok(())
    }
}

/// Launch the transparent capture overlay used to select screen regions.
pub async fn open_capture_overlay(
    app_handle: &tauri::AppHandle,
    payload: CaptureOverlayPayload,
) -> Result<()> {
    app_launcher::capture::launch_capture_overlay(app_handle, &payload)
        .map_err(|err| anyhow!(err))?;

    Ok(())
}

/// Capture a cropped preview of the requested monitor region.
pub async fn render_capture_preview(
    rect: CaptureRect,
    monitor: CaptureMonitor,
) -> Result<CapturePreview> {
    if rect.width == 0 || rect.height == 0 {
        bail!("Capture area must be larger than zero");
    }

    let png_bytes = tauri::async_runtime::spawn_blocking(move || {
        capture_region_as_png(rect, monitor)
    })
    .await
    .map_err(|err| anyhow!("Capture task panicked: {err}"))??;

    let base64 = BASE64_STANDARD.encode(png_bytes);
    let data_url = format!("data:image/png;base64,{base64}");

    Ok(CapturePreview { base_url: data_url })
}

fn capture_region_as_png(
    rect: CaptureRect,
    monitor: CaptureMonitor,
) -> Result<Vec<u8>> {
    let screens = Screen::all()?;

    let target_screen = screens
        .into_iter()
        .find(|screen| {
            let info = screen.display_info;
            info.x == monitor.x
                && info.y == monitor.y
                && info.width == monitor.width
                && info.height == monitor.height
        })
        .or_else(|| Screen::from_point(monitor.x, monitor.y).ok())
        .ok_or_else(|| anyhow!("Failed to resolve monitor for capture"))?;

    let (capture_x, capture_y, capture_width, capture_height) =
        platform_capture_rect(rect, target_screen.display_info.scale_factor);

    let capture = target_screen.capture_area(
        capture_x,
        capture_y,
        capture_width,
        capture_height,
    )?;
    let width = capture.width();
    let height = capture.height();
    if width == 0 || height == 0 {
        bail!("Captured image has zero dimensions");
    }

    let pixels = capture.into_vec();
    let image = RgbaImage::from_raw(width, height, pixels)
        .ok_or_else(|| anyhow!("Failed to rebuild capture buffer"))?;

    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    DynamicImage::ImageRgba8(image)
        .write_to(&mut cursor, ImageFormat::Png)
        .context("Failed to encode capture preview as PNG")?;

    Ok(buffer)
}

#[cfg_attr(not(target_os = "windows"), allow(unused_variables))]
fn platform_capture_rect(
    rect: CaptureRect,
    scale_factor: f32,
) -> (i32, i32, u32, u32) {
    #[cfg(target_os = "windows")]
    {
        let scale = if scale_factor <= 0.0 { 1.0 } else { scale_factor } as f64;
        let x = ((rect.x as f64) * scale).round() as i32;
        let y = ((rect.y as f64) * scale).round() as i32;
        let width = ((rect.width as f64) * scale).round().max(1.0) as u32;
        let height = ((rect.height as f64) * scale).round().max(1.0) as u32;
        (x, y, width, height)
    }

    #[cfg(not(target_os = "windows"))]
    {
        (rect.x, rect.y, rect.width, rect.height)
    }
}

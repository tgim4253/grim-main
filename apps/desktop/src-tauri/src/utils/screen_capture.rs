use std::io::Cursor;

use anyhow::{anyhow, bail, Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use image::{DynamicImage, ImageFormat, RgbaImage};
use screenshots::Screen;
use tokio::task;

use crate::models::capture::{CaptureMonitor, CapturePreview, CaptureRect};

/// Capture a cropped preview of the requested monitor region.
pub async fn render_capture_preview(
    rect: CaptureRect,
    monitor: CaptureMonitor,
) -> Result<CapturePreview> {
    if rect.width == 0 || rect.height == 0 {
        bail!("Capture area must be larger than zero");
    }

    let png_bytes =
        task::spawn_blocking(move || capture_region_as_png(rect, monitor))
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

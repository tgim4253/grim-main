use std::io::Cursor;

use anyhow::{anyhow, bail, Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use image::{DynamicImage, ImageFormat, RgbaImage};
use screenshots::{
    display_info::DisplayInfo, image as screenshot_image, Screen,
};
use tokio::task;

use crate::models::capture::{CaptureMonitor, CapturePreview, CaptureRect};

const MONITOR_MATCH_TOLERANCE: u32 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct MonitorBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

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
    let target_screen = resolve_target_screen(screens, &monitor)
        .ok_or_else(|| anyhow!("Failed to resolve monitor for capture"))?;

    let capture = capture_region_image(&target_screen, rect, &monitor)?;
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

#[cfg(not(target_os = "windows"))]
fn capture_region_image(
    screen: &Screen,
    rect: CaptureRect,
    _monitor: &CaptureMonitor,
) -> Result<screenshot_image::RgbaImage> {
    screen.capture_area(rect.x, rect.y, rect.width, rect.height)
}

#[cfg(target_os = "windows")]
fn capture_region_image(
    screen: &Screen,
    rect: CaptureRect,
    monitor: &CaptureMonitor,
) -> Result<screenshot_image::RgbaImage> {
    // On Windows, mixed-DPI monitor setups can make area capture APIs mix
    // logical coordinates and physical pixels. A full-monitor capture is
    // reliable, so crop it using the renderer's logical monitor bounds.
    let full_capture = screen.capture()?;
    let bounds = map_logical_rect_to_image_bounds(
        rect,
        monitor,
        full_capture.width(),
        full_capture.height(),
    )?;

    Ok(screenshot_image::imageops::crop_imm(
        &full_capture,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
    )
    .to_image())
}

fn resolve_target_screen(
    mut screens: Vec<Screen>,
    monitor: &CaptureMonitor,
) -> Option<Screen> {
    for candidate in monitor_candidates(monitor) {
        if let Some(index) = screens
            .iter()
            .position(|screen| monitor_matches(&screen.display_info, candidate))
        {
            return Some(screens.swap_remove(index));
        }
    }

    for candidate in monitor_candidates(monitor) {
        if let Ok(screen) =
            Screen::from_point(candidate.center_x(), candidate.center_y())
        {
            if monitor_matches(&screen.display_info, candidate) {
                return Some(screen);
            }
        }
    }

    None
}

fn monitor_candidates(monitor: &CaptureMonitor) -> Vec<MonitorBounds> {
    let provided = MonitorBounds::from_monitor(monitor);
    let scale_factor = normalise_scale_factor(monitor.scale_factor);
    let mut candidates = Vec::with_capacity(3);
    push_unique_candidate(&mut candidates, provided);

    if (scale_factor - 1.0).abs() > f64::EPSILON {
        push_unique_candidate(
            &mut candidates,
            provided.scaled_by(1.0 / scale_factor),
        );
        push_unique_candidate(
            &mut candidates,
            provided.scaled_by(scale_factor),
        );
    }

    candidates
}

fn monitor_matches(info: &DisplayInfo, candidate: MonitorBounds) -> bool {
    within_tolerance(info.x, candidate.x)
        && within_tolerance(info.y, candidate.y)
        && info.width.abs_diff(candidate.width) <= MONITOR_MATCH_TOLERANCE
        && info.height.abs_diff(candidate.height) <= MONITOR_MATCH_TOLERANCE
}

fn push_unique_candidate(
    candidates: &mut Vec<MonitorBounds>,
    candidate: MonitorBounds,
) {
    if !candidates.contains(&candidate) {
        candidates.push(candidate);
    }
}

fn normalise_scale_factor(scale_factor: f64) -> f64 {
    if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    }
}

fn within_tolerance(left: i32, right: i32) -> bool {
    left.abs_diff(right) <= MONITOR_MATCH_TOLERANCE
}

impl MonitorBounds {
    fn from_monitor(monitor: &CaptureMonitor) -> Self {
        Self {
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
        }
    }

    fn scaled_by(self, factor: f64) -> Self {
        Self {
            x: scale_coordinate(self.x, factor),
            y: scale_coordinate(self.y, factor),
            width: scale_length(self.width, factor),
            height: scale_length(self.height, factor),
        }
    }

    fn center_x(self) -> i32 {
        self.x + (self.width / 2) as i32
    }

    fn center_y(self) -> i32 {
        self.y + (self.height / 2) as i32
    }
}

fn scale_coordinate(value: i32, factor: f64) -> i32 {
    ((value as f64) * factor).round() as i32
}

fn scale_length(value: u32, factor: f64) -> u32 {
    ((value as f64) * factor).round().max(1.0) as u32
}

#[cfg(any(target_os = "windows", test))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ImageCropBounds {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[cfg(any(target_os = "windows", test))]
fn map_logical_rect_to_image_bounds(
    rect: CaptureRect,
    monitor: &CaptureMonitor,
    image_width: u32,
    image_height: u32,
) -> Result<ImageCropBounds> {
    if image_width == 0 || image_height == 0 {
        bail!("Captured monitor image has zero dimensions");
    }
    if monitor.width == 0 || monitor.height == 0 {
        bail!("Capture monitor bounds must be larger than zero");
    }

    let scale_x = image_width as f64 / monitor.width as f64;
    let scale_y = image_height as f64 / monitor.height as f64;
    let logical_left = rect.x as f64;
    let logical_top = rect.y as f64;
    let logical_right = logical_left + rect.width as f64;
    let logical_bottom = logical_top + rect.height as f64;

    let left = scaled_floor_clamped(logical_left, scale_x, image_width);
    let top = scaled_floor_clamped(logical_top, scale_y, image_height);
    let right = scaled_ceil_clamped(logical_right, scale_x, image_width);
    let bottom = scaled_ceil_clamped(logical_bottom, scale_y, image_height);

    if left >= right || top >= bottom {
        bail!("Mapped capture area is outside monitor bounds");
    }

    Ok(ImageCropBounds {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
    })
}

#[cfg(any(target_os = "windows", test))]
fn scaled_floor_clamped(value: f64, scale: f64, upper_bound: u32) -> u32 {
    clamp_scaled_coordinate((value * scale).floor(), upper_bound)
}

#[cfg(any(target_os = "windows", test))]
fn scaled_ceil_clamped(value: f64, scale: f64, upper_bound: u32) -> u32 {
    clamp_scaled_coordinate((value * scale).ceil(), upper_bound)
}

#[cfg(any(target_os = "windows", test))]
fn clamp_scaled_coordinate(value: f64, upper_bound: u32) -> u32 {
    if !value.is_finite() || value <= 0.0 {
        return 0;
    }

    if value >= upper_bound as f64 {
        return upper_bound;
    }

    value as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn monitor(width: u32, height: u32, scale_factor: f64) -> CaptureMonitor {
        CaptureMonitor { x: 0, y: 0, width, height, scale_factor }
    }

    #[test]
    fn maps_logical_capture_rect_to_physical_image_bounds() {
        let bounds = map_logical_rect_to_image_bounds(
            CaptureRect { x: 100, y: 40, width: 200, height: 80 },
            &monitor(1536, 864, 1.25),
            1920,
            1080,
        )
        .expect("expected mapped bounds");

        assert_eq!(
            bounds,
            ImageCropBounds { x: 125, y: 50, width: 250, height: 100 }
        );
    }

    #[test]
    fn clamps_mapped_capture_rect_to_image_bounds() {
        let bounds = map_logical_rect_to_image_bounds(
            CaptureRect { x: 1535, y: 860, width: 10, height: 10 },
            &monitor(1536, 864, 1.25),
            1920,
            1080,
        )
        .expect("expected clamped bounds");

        assert_eq!(
            bounds,
            ImageCropBounds { x: 1918, y: 1075, width: 2, height: 5 }
        );
    }
}

use std::io::Cursor;

use anyhow::{anyhow, bail, Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use image::{DynamicImage, ImageFormat, RgbaImage};
use screenshots::{display_info::DisplayInfo, Screen};
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

    let capture =
        target_screen.capture_area(rect.x, rect.y, rect.width, rect.height)?;
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

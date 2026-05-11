use tauri::{window::Color, Manager, Monitor, WebviewUrl, WebviewWindow};
#[cfg(target_os = "macos")]
use tauri_plugin_decorum::WebviewWindowExt;

use crate::models::capture::CaptureOverlayPayload;

/// Launch the transparent capture overlay window used across the app.
pub fn launch_capture_overlay(
    app: &tauri::AppHandle,
    source_window: &WebviewWindow,
    payload: &CaptureOverlayPayload,
) -> Result<String, String> {
    let mut params = Vec::new();

    if let Some(record_id) = &payload.record_id {
        push_query_param(&mut params, "record_id", record_id);
    }
    if let Some(asset_id) = &payload.asset_id {
        push_query_param(&mut params, "asset_id", asset_id);
    }
    if let Some(session_id) = &payload.session_id {
        push_query_param(&mut params, "session_id", session_id);
    }
    if let Some(target_seconds) = payload.target_seconds {
        push_query_param(
            &mut params,
            "target_seconds",
            &target_seconds.to_string(),
        );
    }
    if let Some(actual_seconds) = payload.actual_seconds {
        push_query_param(
            &mut params,
            "actual_seconds",
            &actual_seconds.to_string(),
        );
    }
    if let Some(result_save_path) = &payload.result_save_path {
        push_query_param(&mut params, "result_save_path", result_save_path);
    }

    let uri = if params.is_empty() {
        "capture".to_string()
    } else {
        format!("capture?{}", params.join("&"))
    };

    #[cfg(debug_assertions)]
    let url = WebviewUrl::External(
        format!("http://localhost:1420/#/{uri}")
            .parse()
            .map_err(|_| "Failed to parse dev url")?,
    );

    #[cfg(not(debug_assertions))]
    let url = WebviewUrl::App(format!("index.html#/{uri}").into());

    let window_label = "library-capture".to_string();

    if let Some(existing) = app.get_webview_window(&window_label) {
        existing.destroy().map_err(|err| {
            format!("Failed to close existing capture overlay: {err}")
        })?;
    }

    let target_monitor = source_window.current_monitor().map_err(|err| {
        format!("Failed to resolve source window monitor: {err}")
    })?;

    let mut builder =
        tauri::WebviewWindowBuilder::new(app, window_label.clone(), url)
            .title("")
            .resizable(false)
            .maximizable(false)
            .always_on_top(true)
            .background_color(Color(0, 0, 0, 0));

    if let Some(monitor) = target_monitor.as_ref() {
        let bounds = logical_monitor_bounds(monitor);
        builder = builder
            .position(bounds.x, bounds.y)
            .inner_size(bounds.width, bounds.height);
    } else {
        builder = builder.maximized(true);
    }

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Overlay);
    }

    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.decorations(false).transparent(true);
        builder.build().map_err(|err| err.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        let window = builder.build().map_err(|err| err.to_string())?;
        window
            .set_traffic_lights_inset(12.0, 16.0)
            .and_then(|current| current.make_transparent())
            .and_then(|current| current.set_focus())
            .map_err(|err| err.to_string())?;
    }

    Ok(window_label)
}

struct LogicalMonitorBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

fn logical_monitor_bounds(monitor: &Monitor) -> LogicalMonitorBounds {
    let scale_factor = normalise_scale_factor(monitor.scale_factor());
    let position = monitor.position();
    let size = monitor.size();

    LogicalMonitorBounds {
        x: position.x as f64 / scale_factor,
        y: position.y as f64 / scale_factor,
        width: (size.width as f64 / scale_factor).max(1.0),
        height: (size.height as f64 / scale_factor).max(1.0),
    }
}

fn normalise_scale_factor(scale_factor: f64) -> f64 {
    if scale_factor.is_finite() && scale_factor > 0.0 {
        scale_factor
    } else {
        1.0
    }
}

fn push_query_param(params: &mut Vec<String>, key: &str, value: &str) {
    params.push(format!("{key}={}", encode_query_component(value)));
}

fn encode_query_component(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'~' => encoded.push(byte as char),
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

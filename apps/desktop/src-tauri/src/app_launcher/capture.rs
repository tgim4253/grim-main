use tauri::{window::Color, Manager, WebviewUrl};
#[cfg(target_os = "macos")]
use tauri_plugin_decorum::WebviewWindowExt;

use crate::models::capture::CaptureOverlayPayload;

/// Launch the transparent capture overlay window used across the app.
pub fn launch_capture_overlay(
    app: &tauri::AppHandle,
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
        let _ = existing.close();
    }

    let mut builder =
        tauri::WebviewWindowBuilder::new(app, window_label.clone(), url)
            .title("")
            .resizable(false)
            .maximizable(false)
            .always_on_top(true)
            .background_color(Color(0, 0, 0, 0))
            .maximized(true);

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

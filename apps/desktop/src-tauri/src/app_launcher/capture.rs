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
        params.push(format!("record_id={record_id}"));
    }
    if let Some(asset_id) = &payload.asset_id {
        params.push(format!("asset_id={asset_id}"));
    }
    if let Some(session_id) = &payload.session_id {
        params.push(format!("session_id={session_id}"));
    }
    if let Some(target_seconds) = payload.target_seconds {
        params.push(format!("target_seconds={target_seconds}"));
    }
    if let Some(actual_seconds) = payload.actual_seconds {
        params.push(format!("actual_seconds={actual_seconds}"));
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

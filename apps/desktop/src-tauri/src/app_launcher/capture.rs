use tauri::{window::Color, Manager, WebviewUrl};
#[cfg(target_os = "macos")]
use tauri_plugin_decorum::WebviewWindowExt;

use crate::models::capture::CaptureOverlayPayload;

/// Launch the transparent capture overlay window used across the app.
pub fn launch_capture_overlay(
    app: &tauri::AppHandle,
    payload: &CaptureOverlayPayload,
) -> Result<String, String> {
    let mut params = vec![
        format!("moa_id={}", payload.moa_id),
        format!("source_hash={}", payload.source_hash),
        format!("save_path={}", payload.save_path),
    ];

    if let Some(session_id) = &payload.session_id {
        params.push(format!("session_id={}", session_id));
    }

    if let Some(link) = payload.link_type_forward {
        params.push(format!("link_type_forward={}", link.as_str()));
    }

    if let Some(link) = payload.link_type_reverse {
        params.push(format!("link_type_reverse={}", link.as_str()));
    }

    let uri = format!("capture?{}", params.join("&"));

    #[cfg(debug_assertions)]
    let url = WebviewUrl::App(format!("http://localhost:1420/#/{uri}").into());

    #[cfg(not(debug_assertions))]
    let url = WebviewUrl::App(format!("index.html#{uri}").into());

    let window_label = "moa-capture".to_string();

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
        builder = builder.decorations(false);
    }

    let window = builder.build().map_err(|err| err.to_string())?;

    #[cfg(target_os = "macos")]
    {
        window
            .set_traffic_lights_inset(12.0, 16.0)
            .and_then(|w| w.make_transparent())
            .and_then(|w| w.set_focus())
            .map_err(|err| err.to_string())?;
    }

    Ok(window_label)
}

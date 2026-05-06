use tauri::{window::Color, WebviewUrl};
#[cfg(target_os = "macos")]
use tauri_plugin_decorum::WebviewWindowExt;

use crate::models::croquis::CroquisSession;

/// Launch the Croquis window for the provided session, returning the window label.
pub fn launch_croquis(
    app: &tauri::AppHandle,
    session: &CroquisSession,
) -> Result<String, String> {
    let uri = format!("croquis?session_id={}", session.session_id);

    #[cfg(debug_assertions)]
    let url = WebviewUrl::External(
        format!("http://localhost:1420/#/{uri}")
            .parse()
            .map_err(|_| "Failed to parse dev url")?,
    );

    #[cfg(not(debug_assertions))]
    let url = WebviewUrl::App(format!("index.html#/{uri}").into());

    let window_label = "library-croquis".to_string();

    let mut builder =
        tauri::WebviewWindowBuilder::new(app, window_label.clone(), url)
            .title("")
            .resizable(true)
            .maximizable(false)
            .always_on_top(true)
            .background_color(Color(0, 0, 0, 0));

    let width = parse_dimension(session.window_width.as_ref());
    let height = parse_dimension(session.window_height.as_ref());

    builder = match (width, height) {
        (Some(w), Some(h)) => builder.inner_size(w, h),
        (Some(w), None) => builder.inner_size(w, w),
        _ => builder.inner_size(256.0, 512.0),
    };

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
        window.create_overlay_titlebar().map_err(|err| err.to_string())?;
        window
            .set_traffic_lights_inset(12.0, 16.0)
            .and_then(|current| current.make_transparent())
            .map_err(|err| err.to_string())?;
    }

    Ok(window_label)
}

fn parse_dimension(value: Option<&String>) -> Option<f64> {
    let raw = value?.trim();
    if raw.is_empty() {
        return None;
    }
    raw.parse::<f64>().ok().filter(|parsed| *parsed > 0.0)
}

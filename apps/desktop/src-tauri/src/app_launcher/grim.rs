use tauri::{Manager, WebviewUrl};
#[cfg(target_os = "macos")]
use tauri_plugin_decorum::WebviewWindowExt;

/// Launch the primary library window.
pub fn launch_main_window(app: &tauri::AppHandle) -> Result<(), String> {
    let window_label = "library-main".to_string();

    if let Some(existing) = app.get_webview_window(&window_label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    #[cfg(debug_assertions)]
    let url = WebviewUrl::External(
        "http://localhost:1420/#/"
            .parse()
            .map_err(|_| "Failed to parse dev url")?,
    );

    #[cfg(not(debug_assertions))]
    let url = WebviewUrl::App("index.html#/".into());

    let web_builder =
        tauri::WebviewWindowBuilder::new(app, window_label.clone(), url)
            .title("Grim")
            .inner_size(1440.0, 920.0)
            .disable_drag_drop_handler();

    #[cfg(target_os = "macos")]
    let web_builder =
        web_builder.title_bar_style(tauri::TitleBarStyle::Overlay);

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let web_builder = web_builder.decorations(false);

    let window = web_builder.build().map_err(|err| err.to_string())?;

    #[cfg(target_os = "macos")]
    window.create_overlay_titlebar().map_err(|err| err.to_string())?;

    #[cfg(target_os = "macos")]
    {
        window
            .set_traffic_lights_inset(12.0, 16.0)
            .and_then(|current| current.make_transparent())
            .map_err(|err| err.to_string())?;
    }

    Ok(())
}

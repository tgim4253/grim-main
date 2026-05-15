use tauri::{Manager, Url, WebviewUrl};
#[cfg(target_os = "macos")]
use tauri_plugin_decorum::WebviewWindowExt;

fn is_allowed_grim_navigation(url: &Url) -> bool {
    if url.scheme() == "tauri" {
        return true;
    }

    if url.scheme() == "http" && url.host_str() == Some("tauri.localhost") {
        return true;
    }

    cfg!(debug_assertions)
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"))
        && url.port_or_known_default() == Some(1420)
}

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
            .disable_drag_drop_handler()
            .on_navigation(is_allowed_grim_navigation)
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny);

    #[cfg(target_os = "macos")]
    let web_builder =
        web_builder.title_bar_style(tauri::TitleBarStyle::Overlay);

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let web_builder = web_builder.decorations(false);

    #[cfg(target_os = "macos")]
    {
        let window = web_builder.build().map_err(|err| err.to_string())?;

        window.create_overlay_titlebar().map_err(|err| err.to_string())?;

        window
            .set_traffic_lights_inset(12.0, 16.0)
            .and_then(|current| current.make_transparent())
            .map_err(|err| err.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        web_builder.build().map_err(|err| err.to_string())?;
    }

    Ok(())
}

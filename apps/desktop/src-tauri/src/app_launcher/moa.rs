use tauri::WebviewUrl;
#[cfg(target_os = "macos")]
use tauri_plugin_decorum::WebviewWindowExt; // decorum helpers

pub fn launch_moa_selector(app: &tauri::AppHandle) -> Result<(), String> {
    let web_builder = tauri::WebviewWindowBuilder::new(
        app,
        "moa-create",
        WebviewUrl::App("index/#/create-moa".into()),
    )
    .title("Create Moa")
    .inner_size(800.0, 600.0)
    .resizable(false)
    .maximizable(false);

    // keep overlay on macOS
    #[cfg(target_os = "macos")]
    let web_builder = web_builder.title_bar_style(tauri::TitleBarStyle::Overlay);

    #[cfg(not(target_os = "macos"))]
    let web_builder = web_builder.decorations(false);

    let window = web_builder.build().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    window
        .create_overlay_titlebar() // remove native bar, add draggable overlay
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        window
            .set_traffic_lights_inset(12.0, 16.0) // move traffic-lights
            .and_then(|w| w.make_transparent()) // acrylic background
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

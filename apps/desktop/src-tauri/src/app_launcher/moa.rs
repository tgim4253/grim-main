use tauri::WebviewUrl;
#[cfg(target_os = "macos")]
use tauri_plugin_decorum::WebviewWindowExt;

/// Launch the workspace selector window used to create or pick a Moa project.
pub fn launch_moa_selector(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    let url = WebviewUrl::External(
        "http://localhost:1420/#/create-moa"
            .parse()
            .map_err(|_| "error parsing uri")?,
    );

    #[cfg(not(debug_assertions))]
    let url = WebviewUrl::App("index.html#create-moa".into());

    let web_builder = tauri::WebviewWindowBuilder::new(app, "moa-create", url)
        .title("Create Moa")
        .inner_size(800.0, 600.0)
        .resizable(false)
        .maximizable(false);

    #[cfg(target_os = "macos")]
    let web_builder =
        web_builder.title_bar_style(tauri::TitleBarStyle::Overlay);

    #[cfg(not(target_os = "macos"))]
    {
        let web_builder = web_builder.decorations(false);
        web_builder.build().map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        let window: tauri::WebviewWindow =
            web_builder.build().map_err(|e| e.to_string())?;
        window.create_overlay_titlebar().map_err(|e| e.to_string())?;
        window
            .set_traffic_lights_inset(12.0, 16.0)
            .and_then(|w| w.make_transparent())
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

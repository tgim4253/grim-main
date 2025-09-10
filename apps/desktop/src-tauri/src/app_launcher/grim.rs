use tauri::WebviewUrl;
#[cfg(target_os = "macos")]
use tauri_plugin_decorum::WebviewWindowExt; // decorum helpers

pub fn launch_moa(
    app: &tauri::AppHandle,
    moa_id: String,
) -> Result<(), String> {
    let uri = format!("moa?moa_id={}", moa_id.clone());

    #[cfg(debug_assertions)]
    let url = WebviewUrl::App(format!("index.html#{uri}").into());
    // let url =
    //     // WebviewUrl::External("http://localhost:1420/#/moa".parse().unwrap());

    #[cfg(not(debug_assertions))]
    let url = WebviewUrl::App(format!("index.html#{uri}").into());

    let moa = crate::services::moa_services::MOA_DATA
        .read()
        .unwrap()
        .get_by_id(&moa_id)
        .unwrap();

    let web_builder = tauri::WebviewWindowBuilder::new(app, "moa-main", url)
        .title(moa.name.clone())
        .inner_size(1200.0, 600.0);

    // keep overlay on macOS too
    #[cfg(target_os = "macos")]
    let web_builder =
        web_builder.title_bar_style(tauri::TitleBarStyle::Overlay);

    #[cfg(not(target_os = "macos"))]
    let web_builder = web_builder.decorations(false);

    let window = web_builder.build().map_err(|e| e.to_string())?;

    // 2) apply decorum helpers
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

    window.open_devtools();

    Ok(())
}

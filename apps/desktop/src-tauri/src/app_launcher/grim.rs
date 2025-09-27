use tauri::{WebviewUrl, WindowEvent};
#[cfg(target_os = "macos")]
use tauri_plugin_decorum::WebviewWindowExt;

use crate::services::file_service::job_queue::{
    register_moa_window, unregister_moa_window,
};

/// Launch the primary Moa window for the provided workspace identifier.
pub fn launch_moa(
    app: &tauri::AppHandle,
    moa_id: String,
) -> Result<(), String> {
    let uri = format!("moa?moa_id={moa_id}");

    #[cfg(debug_assertions)]
    let url = WebviewUrl::App(format!("index.html#{uri}").into());

    #[cfg(not(debug_assertions))]
    let url = WebviewUrl::App(format!("index.html#{uri}").into());

    let moa = crate::services::moa_services::MOA_DATA
        .read()
        .map_err(|err| err.to_string())?
        .get_by_id(&moa_id)
        .ok_or_else(|| format!("Unknown Moa id: {moa_id}"))?;

    let web_builder = tauri::WebviewWindowBuilder::new(app, "moa-main", url)
        .title(moa.name.clone())
        .inner_size(1200.0, 600.0)
        .disable_drag_drop_handler();

    #[cfg(target_os = "macos")]
    let web_builder =
        web_builder.title_bar_style(tauri::TitleBarStyle::Overlay);

    #[cfg(not(target_os = "macos"))]
    let web_builder = web_builder.decorations(false);

    let window = web_builder.build().map_err(|e| e.to_string())?;

    let register_id = moa_id.clone();
    tauri::async_runtime::spawn(async move {
        register_moa_window(&register_id).await;
    });

    {
        let event_id = moa_id.clone();
        window.on_window_event(move |event| {
            if matches!(event, WindowEvent::Destroyed) {
                let event_id = event_id.clone();
                tauri::async_runtime::spawn(async move {
                    unregister_moa_window(&event_id).await;
                });
            }
        });
    }

    #[cfg(target_os = "macos")]
    window.create_overlay_titlebar().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    {
        window
            .set_traffic_lights_inset(12.0, 16.0)
            .and_then(|w| w.make_transparent())
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

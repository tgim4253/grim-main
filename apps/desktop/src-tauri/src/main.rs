#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_launcher;
mod bootstrap;
mod commands;
mod config;
mod db;
mod errors;
mod models;
mod services;
mod utils;

use services::moa_services;
use tokio::sync::mpsc;

use tracing::error;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use crate::services::{
    bootstrap_service::AppState,
    file_service::{worker_loop, THUMBNAIL_WORKER_STATE},
};

/// Entry point for the Grim desktop application.
fn main() {
    let filter = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new("info"))
        .unwrap();

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_target(true))
        .init();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::moa::list_moas,
            commands::moa::create_moa,
            commands::moa::open_moa,
            commands::moa::bootstrap_moa,
            commands::file::create_folder,
            commands::moa::bootstrap_status,
            commands::graph::get_graph_one,
            commands::file::get_thumbnails,
            commands::file::preview_folder_import,
            commands::croquis::start_croquis_session,
            commands::croquis::load_croquis_session,
            commands::croquis::load_croquis_option,
            commands::croquis::start_croquis_capture,
            commands::croquis::load_croquis_capture_context,
            commands::croquis::render_croquis_capture_preview,
            commands::croquis::confirm_croquis_capture,
            commands::croquis::cancel_croquis_capture,
        ])
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_decorum::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            let latest_moa = tauri::async_runtime::block_on(async {
                moa_services::load_latest_moas(&app.handle()).await
            })
            .unwrap_or_else(|err| {
                error!("Failed to load recent MOA: {err}");
                None
            });

            // Restore the last session if available, otherwise open the selector.
            match latest_moa {
                Some(moa) => {
                    app_launcher::grim::launch_moa(
                        &app.handle(),
                        moa.moa_id.clone(),
                    )?;
                }
                None => {
                    app_launcher::moa::launch_moa_selector(&app.handle())?;
                }
            }

            let (tx, rx) = mpsc::channel::<()>(64);
            THUMBNAIL_WORKER_STATE.signal.set(tx).map_err(|_| {
                anyhow::anyhow!("thumbnail worker already initialized")
            })?;
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(worker_loop(app_handle, rx));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

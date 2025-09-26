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
    file_service::{
        init_scan_worker, scan_worker_loop, thumbnail_worker_loop,
        SCAN_WORKER_STATE, THUMBNAIL_WORKER_STATE,
    },
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
            commands::file::get_thumbnail_usage,
            commands::file::clear_thumbnail_cache,
            commands::file::clear_base_thumbnail_cache,
            commands::file::sync_folder_mount,
            commands::file::update_folder_mount_options,
            commands::croquis::start_croquis_session,
            commands::croquis::load_croquis_session,
            commands::croquis::load_croquis_option,
            commands::croquis::open_croquis_capture_overlay,
            commands::croquis::render_croquis_capture_preview,
            commands::croquis::confirm_croquis_capture,
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

            let app_handle = app.handle().clone();

            let (thumb_tx, thumb_rx) = mpsc::channel::<()>(64);
            THUMBNAIL_WORKER_STATE.signal.set(thumb_tx).map_err(|_| {
                anyhow::anyhow!("thumbnail worker already initialized")
            })?;
            tauri::async_runtime::spawn(thumbnail_worker_loop(
                app_handle.clone(),
                thumb_rx,
            ));

            init_scan_worker(&app.handle())?;
            let (scan_tx, scan_rx) = mpsc::channel::<()>(64);
            SCAN_WORKER_STATE.signal.set(scan_tx).map_err(|_| {
                anyhow::anyhow!("scan worker already initialized")
            })?;
            tauri::async_runtime::spawn(scan_worker_loop(scan_rx));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

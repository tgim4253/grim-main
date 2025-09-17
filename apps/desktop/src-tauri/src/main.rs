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

use crate::services::{
    bootstrap_service::AppState,
    file_service::{worker_loop, STATE},
};

fn main() {
    // Print any startup errors to stderr so they surface in system logs.
    if let Err(error) = run() {
        eprintln!("failed to start tauri application: {error:?}");
    }
}

/// Bootstraps the Tauri builder, wiring commands, plugins, and background tasks.
fn run() -> tauri::Result<()> {
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
        ])
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_decorum::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            let latest_moa = moa_services::load_latest_moas(&app.handle());

            // Restore the last session if available, otherwise open the selector.
            match latest_moa {
                Some(moa) => {
                    app_launcher::grim::launch_moa(&app.handle(), moa.moa_id.clone())?;
                }
                None => {
                    app_launcher::moa::launch_moa_selector(&app.handle())?;
                }
            }

            let (tx, rx) = mpsc::channel::<()>(64);
            STATE.tx.set(tx).map_err(|_| {
                anyhow::anyhow!("thumbnail worker already initialized")
            })?;
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(worker_loop(app_handle, rx));

            Ok(())
        })
        .run(tauri::generate_context!())?;

    Ok(())
}

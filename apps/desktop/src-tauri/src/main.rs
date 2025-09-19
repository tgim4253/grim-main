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

use std::sync::Arc;

use services::moa_services;
use tokio::sync::mpsc;
use tracing::error;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use crate::services::{
    bootstrap_service::AppState,
    file_service::{worker_loop, THUMBNAIL_WORKER_STATE},
};

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
        ])
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_decorum::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            let moa = moa_services::load_latest_moas(&app.handle());

            match moa {
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
            STATE.tx.set(tx).map_err(|_| {
                anyhow::anyhow!("thumbnail worker already initialized")
            })?;
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(worker_loop(app_handle, rx));

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

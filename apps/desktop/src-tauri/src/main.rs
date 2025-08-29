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
use tokio::sync::Mutex;

use crate::services::bootstrap_service::{AppState, AppStatus};

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::moa::list_moas,
            commands::moa::create_moa,
            commands::moa::open_moa,
            commands::moa::bootstrap_moa,
            commands::file::create_folder,
            commands::moa::bootstrap_status,
            commands::graph::fetch_graph_one,
        ])
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_decorum::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            let moa = moa_services::load_latest_moas(&app.handle());

            match moa {
                Some(moa) => {
                    app_launcher::grim::launch_moa(&app.handle(), moa.moa_id.clone())?;
                }
                None => {
                    app_launcher::moa::launch_moa_selector(&app.handle())?;
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

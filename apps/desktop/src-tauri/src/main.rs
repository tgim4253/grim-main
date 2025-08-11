#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_launcher;
mod bootstrap;
mod commands;
mod config;
mod errors;
mod models;
mod services;
mod utils;

use services::moa_services;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::moa::list_moas,
            commands::moa::create_moa,
            commands::moa::open_moa,
            commands::moa::bootstrap_moa,
            commands::db::create_folder,
        ])
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_decorum::init())
        .plugin(tauri_plugin_dialog::init())
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

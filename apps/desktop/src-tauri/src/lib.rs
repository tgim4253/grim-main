#![allow(clippy::uninlined_format_args)]
#![allow(clippy::needless_lifetimes)]
#![allow(clippy::redundant_closure)]
#![allow(clippy::vec_init_then_push)]
#![allow(clippy::unnecessary_cast)]
#![allow(clippy::ptr_arg)]
#![allow(clippy::useless_conversion)]
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod app_launcher;
pub mod commands;
pub mod models;
pub mod services;
pub mod state;
pub mod utils;

use tauri::Manager;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use crate::services::{CaptureService, CroquisService, LibraryService};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let filter = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new("info"))
        .unwrap();

    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_target(true))
        .try_init();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::library_commands::load_library_snapshot,
            commands::library_commands::load_library_settings,
            commands::library_commands::save_library_settings,
            commands::library_commands::load_croquis_preferences,
            commands::library_commands::save_croquis_preferences,
            commands::folder_commands::save_virtual_folder,
            commands::folder_commands::delete_virtual_folder,
            commands::folder_commands::search_virtual_folders,
            commands::asset_commands::list_assets,
            commands::asset_commands::get_asset_detail,
            commands::asset_commands::update_asset_folders,
            commands::asset_commands::update_asset_tags,
            commands::asset_commands::reveal_path,
            commands::import_commands::import_images,
            commands::import_commands::link_external_files,
            commands::record_commands::list_recent_records,
            commands::record_commands::get_record_detail,
            commands::record_commands::save_croquis_record,
            commands::record_commands::delete_croquis_record,
            commands::record_commands::start_croquis_record,
            commands::record_commands::finalize_croquis_record,
            commands::record_commands::update_croquis_record_tags,
            commands::session_commands::list_recent_sessions,
            commands::session_commands::get_session_detail,
            commands::session_commands::list_session_presets,
            commands::session_commands::save_session_preset,
            commands::session_commands::delete_session_preset,
            commands::session_commands::start_croquis_session,
            commands::session_commands::load_croquis_session,
            commands::tag_commands::load_tag_index,
            commands::tag_commands::save_tag_group,
            commands::tag_commands::delete_tag_group,
            commands::tag_commands::save_tag,
            commands::tag_commands::delete_tag,
            commands::capture_commands::open_capture_overlay,
            commands::capture_commands::render_capture_preview,
            commands::capture_commands::confirm_capture,
        ])
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_decorum::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle();
            let app_state = tauri::async_runtime::block_on(
                state::AppState::initialize(handle),
            )
            .map_err(std::io::Error::other)?;
            let library_service = LibraryService::new(app_state.clone());
            let croquis_service =
                CroquisService::new(app_state.clone(), library_service.clone());
            let capture_service =
                CaptureService::new(app_state.clone(), library_service.clone());

            app.manage(app_state);
            app.manage(library_service);
            app.manage(croquis_service);
            app.manage(capture_service);

            app_launcher::grim::launch_main_window(handle)
                .map_err(std::io::Error::other)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

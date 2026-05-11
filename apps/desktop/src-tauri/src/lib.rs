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
pub mod errors;
pub mod models;
pub mod repositories;
pub mod services;
pub mod state;
pub mod utils;

use tauri::Manager;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

use crate::{
    repositories::{
        AssetRepository, FolderRepository, RecordRepository, SessionRepository,
        TagRepository,
    },
    services::{
        AssetService, CaptureService, CroquisService, FolderService,
        LibraryService, LibraryStorage, RecordService, SessionService,
        TagService,
    },
};

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
            commands::library_commands::load_explorer_snapshot,
            commands::folder_commands::save_virtual_folder,
            commands::folder_commands::delete_virtual_folder,
            commands::folder_commands::search_virtual_folders,
            commands::asset_commands::list_assets,
            commands::asset_commands::get_asset_detail,
            commands::asset_commands::update_asset_folders,
            commands::asset_commands::batch_update_asset_folders,
            commands::asset_commands::reveal_path,
            commands::import_commands::preview_import_images,
            commands::import_commands::import_images,
            commands::import_commands::import_remote_images,
            commands::record_commands::list_recent_record_results,
            commands::record_commands::get_record_detail,
            commands::record_commands::save_croquis_record,
            commands::record_commands::delete_croquis_record,
            commands::record_commands::finish_croquis_record,
            commands::record_commands::update_croquis_record_tags,
            commands::session_commands::list_session_presets,
            commands::session_commands::list_time_step_presets,
            commands::session_commands::save_session_preset,
            commands::session_commands::delete_session_preset,
            commands::session_commands::save_time_step_preset,
            commands::session_commands::delete_time_step_preset,
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
            let asset_scope = app.asset_protocol_scope();
            asset_scope
                .allow_directory(&app_state.library_paths.asset_dir, true)
                .map_err(std::io::Error::other)?;
            asset_scope
                .allow_directory(&app_state.library_paths.thumb_dir, true)
                .map_err(std::io::Error::other)?;
            let asset_repository = AssetRepository::new(app_state.pool.clone());
            let folder_repository =
                FolderRepository::new(app_state.pool.clone());
            let tag_repository = TagRepository::new(app_state.pool.clone());
            let session_repository =
                SessionRepository::new(app_state.pool.clone());
            let record_repository =
                RecordRepository::new(app_state.pool.clone());

            let library_storage =
                LibraryStorage::new(app_state.library_paths.clone());
            let asset_service = AssetService::new(
                asset_repository.clone(),
                folder_repository.clone(),
                library_storage.clone(),
            );
            let folder_service = FolderService::new(folder_repository);
            let tag_service = TagService::new(tag_repository.clone());
            let record_service = RecordService::new(
                record_repository,
                asset_repository,
                library_storage.clone(),
            );
            let session_service =
                SessionService::new(session_repository, tag_repository);

            let library_service = LibraryService::new(
                asset_service.clone(),
                folder_service.clone(),
                tag_service.clone(),
                session_service.clone(),
                record_service.clone(),
            );
            let croquis_service =
                CroquisService::new(asset_service.clone(), library_storage);
            let capture_service = CaptureService::new(
                asset_service.clone(),
                record_service.clone(),
            );

            app.manage(app_state);
            app.manage(asset_service);
            app.manage(folder_service);
            app.manage(tag_service);
            app.manage(record_service);
            app.manage(session_service);
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

use crate::app_launcher::grim::launch_moa;
use crate::config::moa::Moa;
use crate::services::bootstrap_service::bootstrap_moa_service;
use crate::services::{db, integrity, moa_services};
use anyhow::{Context, Result};

#[tauri::command]
pub fn list_moas(app: tauri::AppHandle) -> Vec<Moa> {
    moa_services::load_moas(&app)
}

#[tauri::command]
pub fn create_moa(app: tauri::AppHandle, moa: Moa) -> Result<Moa, String> {
    moa_services::create_moa(&app, &moa)
}

#[tauri::command]
pub async fn open_moa(app: tauri::AppHandle, moa_id: String) -> Result<(), String> {
    launch_moa(&app, moa_id)
}

#[tauri::command]
pub async fn bootstrap_moa(
    app_handle: tauri::AppHandle,
    moa_id: String,
) -> Result<Vec<crate::models::node::Node>, String> {
    bootstrap_moa_service(app_handle, moa_id.clone()).await.map_err(|e| e.to_string())?;
    let folders = db::fetch_folder_nodes(moa_id.clone()).await.map_err(|e| e.to_string())?;

    Ok(folders)
}

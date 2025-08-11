use crate::app_launcher::grim::launch_moa;
use crate::app_launcher::moa;
use crate::config::moa::Moa;
use crate::services::bootstrap_service::{bootstrap_moa_service, fetch_init_data_for_front};
use crate::services::{db, integrity, moa_services};
use anyhow::{Context, Result};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FolderData {
    name: String,
    path: String,
    parent_id: String,
}

#[tauri::command]
pub async fn create_folder(
    app: tauri::AppHandle,
    moa_id: String,
    data: FolderData,
) -> Result<(), String> {
    db::create_folder_node(moa_id, data.name, data.parent_id).await.map_err(|e| e.to_string())?;
    Ok(())
}

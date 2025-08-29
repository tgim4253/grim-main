use crate::services::file_service::{self, first_mount_folder};
use anyhow::Result;

#[tauri::command]
pub async fn fetch_graph_one(
    app_handle: tauri::AppHandle,
    moa_id: String,
    node_id: String,
) -> Result<(), String> {
    let node = file_service::create_folder(moa_id.clone(), data.clone())
        .await
        .map_err(|e| e.to_string())?;

    if let Some(path) = data.path {
        if !path.is_empty() {
            first_mount_folder(moa_id.clone().clone(), node, path)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

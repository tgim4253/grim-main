use anyhow::Result;

use crate::{models::file::FolderData, services::db};

pub async fn create_folder(app: tauri::AppHandle, moa_id: String, data: FolderData) -> Result<()> {
    let node = db::create_virtual_folder(moa_id.clone(), data.name, data.parent_id).await?;

    if let Some(path) = data.path {
        first_mount_folder(app, moa_id.clone(), path);
    }
    Ok(())
}

pub async fn first_mount_folder(app: tauri::AppHandle, moa_id: String, path: String) -> Result<()> {
    let norm_path = crate::utils::path_utils::normalize_path(&path);

    // storage root
    let sroot_info = crate::utils::path_utils::detect_storage_root(&norm_path);

    Ok(())
}

use std::path::PathBuf;
use tauri::{path::BaseDirectory, AppHandle, Manager};

pub fn get_moa_file_path(app: &AppHandle) -> PathBuf {
    app.path()
        .resolve("moa.json", BaseDirectory::AppData)
        .unwrap_or_else(|_| std::env::current_dir().unwrap().join("moa.json"))
}

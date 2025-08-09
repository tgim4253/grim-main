use crate::bootstrap::build_paths;
use crate::config::moa::Moa;
use crate::services::moa_services;
use crate::utils::identifier::get_unique_id;
use crate::utils::path_utils;

use once_cell::sync::Lazy;

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::RwLock;

pub struct MoaData {
    pub moas: HashMap<String, Moa>,
}

pub static MOA_DATA: Lazy<RwLock<MoaData>> = Lazy::new(|| RwLock::new(MoaData::new()));
impl MoaData {
    pub fn new() -> Self {
        MoaData { moas: HashMap::new() }
    }

    pub fn get_by_id(&self, moa_id: &str) -> Option<Moa> {
        self.moas.get(moa_id).cloned()
    }

    pub fn add(&mut self, moa: Moa) {
        if self.moas.contains_key(&moa.moa_id) {
            return ();
        }
        self.moas.insert(moa.moa_id.clone(), moa);
    }
}

/// Load all moas from moas.json
pub fn load_moas(app: &tauri::AppHandle) -> Vec<Moa> {
    let moa_file_path = path_utils::get_moa_file_path(app);

    print!("{}", moa_file_path.display());

    if let Ok(file_content) = fs::read_to_string(&moa_file_path) {
        let mut moas = serde_json::from_str::<Vec<Moa>>(&file_content).unwrap_or_default();

        // Sort by last_opened_at in descending order (most recent first)
        moas.sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));

        let mut moa_data = MOA_DATA.write().unwrap();
        (&moas).into_iter().for_each(|moa| {
            moa_data.add(moa.clone());
        });

        moas
    } else {
        Vec::new()
    }
}

/// Load latest opened moas from moas.json

pub fn load_latest_moas(app: &tauri::AppHandle) -> Option<Moa> {
    load_moas(app)
        .into_iter()
        .filter(|moa| moa.last_opened_at.is_some())
        .max_by(|a, b| a.last_opened_at.cmp(&b.last_opened_at))
}

/// Save moas(Vec<Moa>) to string

pub fn save_moas(app: &tauri::AppHandle, moas: &Vec<Moa>) -> Result<(), String> {
    let moa_file_path = path_utils::get_moa_file_path(app);

    if let Ok(file_content) = serde_json::to_string(&moas) {
        if let Some(parent) = moa_file_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        println!("{}", moa_file_path.display());
        if let Err(e) = fs::write(&moa_file_path, file_content) {
            return Err(format!("Failed to save moas: {}", e));
        }
    } else {
        return Err("Failed to serialize moas".to_string());
    }

    Ok(())
}

pub fn create_moa(app: &tauri::AppHandle, moa: &Moa) -> Result<Moa, String> {
    let mut moas = moa_services::load_moas(&app);
    let path = moa.path.clone();
    let name = moa.name.clone();

    let full_path = build_paths(&path, &name);

    if !Path::new(&path).exists() {
        return Err(format!("Path '{}' does not exist.", path));
    }

    if moas.iter().any(|m| m.name == name && m.path == path) {
        return Err(format!("Moa with name '{}' and path '{} already exists.", name, path));
    }

    if let Err(e) = fs::create_dir_all(&full_path) {
        return Err(format!("Failed to create folder '{}': {}", full_path.display(), e));
    }

    let new_moa = Moa { name, path, last_opened_at: None, moa_id: get_unique_id() };

    moas.push(new_moa.clone());

    if let Err(e) = moa_services::save_moas(&app, &moas) {
        return Err(format!("Failed to save moa: {}", e));
    }

    Ok(new_moa)
}

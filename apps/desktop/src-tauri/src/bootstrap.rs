use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};

use crate::config::moa::MoaConfig;
use crate::services::moa_services;
use crate::utils::date;
use once_cell::sync::Lazy;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct MoaPaths {
    pub base_dir: PathBuf, // path/name
    pub moa_dir: PathBuf,  // path/name/.moa
    pub db_path: PathBuf,  // path/name/.moa/grim.db
    pub cfg_path: PathBuf, // path/name/.moa/config.json
}
pub struct PathManager {
    paths: RwLock<HashMap<String, MoaPaths>>, // key = moa_id
}

pub static PATH_MANAGER: Lazy<Arc<PathManager>> = Lazy::new(|| Arc::new(PathManager::new()));
impl PathManager {
    pub fn new() -> Self {
        Self { paths: RwLock::new(HashMap::new()) }
    }

    pub async fn get_or_add(&self, moa_id: &str) -> anyhow::Result<MoaPaths> {
        let mut paths = self.paths.write().await;
        if let Some(path) = paths.get(moa_id) {
            return Ok(path.clone());
        }

        let moa = moa_services::MOA_DATA.read().unwrap().get_by_id(moa_id).unwrap();
        let path = build_paths(&moa.path, &moa.name);
        let moa_paths = ensure_layout(&path)?;

        paths.insert(moa_id.to_string(), moa_paths.clone());

        Ok(moa_paths)
    }
}

//Normalize target base path with project name
pub fn build_paths(base: &str, name: &str) -> PathBuf {
    Path::new(base).join(name)
}

pub fn ensure_layout(base: &Path) -> Result<MoaPaths> {
    // .moa dir and files
    let moa_dir = base.join(".moa");
    // check .moa folder exists
    if !moa_dir.exists() {
        // creat .moa folder if not exists
        fs::create_dir_all(&moa_dir)
            .with_context(|| format!("Failed to create .moa at {}", moa_dir.display()))?;
    }

    // other files
    let db_path = moa_dir.join("grim.db");
    let cfg_path = moa_dir.join("config.json");

    if !cfg_path.exists() {
        // create initial config
        let cfg = MoaConfig {
            app: "moa".to_string(),
            first: true,
            created_at: date::get_now_date(),
            database_version: crate::services::integrity::TARGET_DB_VERSION,
        };
        fs::write(&cfg_path, serde_json::to_vec_pretty(&cfg)?)
            .with_context(|| "Failed to write config.json")?;
    }

    // db will be created later by integrity routine if missing
    Ok(MoaPaths { base_dir: base.to_path_buf(), moa_dir, db_path, cfg_path })
}

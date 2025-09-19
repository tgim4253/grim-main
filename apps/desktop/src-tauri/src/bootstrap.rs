use anyhow::{Context, Result};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::config::moa::MoaConfig;
use crate::services::moa_services;
use crate::utils::date;
use once_cell::sync::Lazy;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

const MOA_DIR_NAME: &str = ".moa";
const CACHED_DIR_NAME: &str = ".cached";
const THUMBS_DIR_NAME: &str = "thumbs";
const DB_FILE_NAME: &str = "grim.db";
const CFG_FILE_NAME: &str = "config.json";

#[derive(Clone)]
pub struct MoaPaths {
    pub base_dir: PathBuf,   // path/name
    pub moa_dir: PathBuf,    // path/name/.moa
    pub db_path: PathBuf,    // path/name/.moa/grim.db
    pub cached_dir: PathBuf, // path/name/.moa/.chached
    pub thumb_dir: PathBuf,  // path/name/.moa/.chached/thumbs
    pub cfg_path: PathBuf,   // path/name/.moa/config.json
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
    let moa_dir = base.join(MOA_DIR_NAME);
    fs::create_dir_all(&moa_dir)
        .with_context(|| format!("Failed to create .moa at {}", moa_dir.display()))?;

    let db_path = moa_dir.join(DB_FILE_NAME);
    let cfg_path = moa_dir.join(CFG_FILE_NAME);

    if !cfg_path.exists() {
        // open with create_new to avoid races
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&cfg_path)
            .with_context(|| format!("Failed to create {}", cfg_path.display()))?;

        // build initial config
        let cfg = MoaConfig {
            app: "moa".to_string(),
            first: true,
            created_at: date::get_now_date(),
            database_version: crate::services::integrity::TARGET_DB_VERSION,
        };
        let cfg_bytes =
            serde_json::to_vec_pretty(&cfg).context("Failed to serialize initial config.json")?;

        file.write_all(&cfg_bytes)
            .with_context(|| format!("Failed to write {}", cfg_path.display()))?;
        file.flush().ok();
    }

    // .moa/.cached and thumbs
    let cached_dir = moa_dir.join(CACHED_DIR_NAME);
    let thumb_dir = cached_dir.join(THUMBS_DIR_NAME);

    fs::create_dir_all(&cached_dir)
        .with_context(|| format!("Failed to create {}", cached_dir.display()))?;
    fs::create_dir_all(&thumb_dir)
        .with_context(|| format!("Failed to create {}", thumb_dir.display()))?;

    Ok(MoaPaths { base_dir: base.to_path_buf(), moa_dir, db_path, cfg_path, thumb_dir, cached_dir })
}

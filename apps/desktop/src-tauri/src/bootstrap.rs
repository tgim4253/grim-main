use anyhow::{anyhow, Context, Result};
use std::path::{Path, PathBuf};
use tokio::fs::{self, OpenOptions};
use tokio::io::AsyncWriteExt;

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
    /// Base directory containing the workspace root ("path/name").
    pub base_dir: PathBuf,
    /// Hidden Moa directory used for metadata ("path/name/.moa").
    pub moa_dir: PathBuf,
    /// Location of the SQLite database file ("path/name/.moa/grim.db").
    pub db_path: PathBuf,
    /// Cache directory used for transient state ("path/name/.moa/.cached").
    pub cached_dir: PathBuf,
    /// Thumbnail cache directory ("path/name/.moa/.cached/thumbs").
    pub thumb_dir: PathBuf,
    /// Path to the persisted configuration file ("path/name/.moa/config.json").
    pub cfg_path: PathBuf,
}

/// Lazily computed map of derived Moa paths keyed by workspace identifier.
pub struct PathManager {
    paths: RwLock<HashMap<String, MoaPaths>>,
}

/// Shared instance responsible for caching derived filesystem paths.
pub static PATH_MANAGER: Lazy<Arc<PathManager>> =
    Lazy::new(|| Arc::new(PathManager::new()));
impl PathManager {
    /// Create an empty path cache.
    pub fn new() -> Self {
        Self { paths: RwLock::new(HashMap::new()) }
    }

    /// Resolve cached paths for the given Moa id, populating them if necessary.
    pub async fn get_or_add(&self, moa_id: &str) -> anyhow::Result<MoaPaths> {
        if let Some(existing) = {
            let paths = self.paths.read().await;
            paths.get(moa_id).cloned()
        } {
            return Ok(existing);
        }

        let moa_data = moa_services::MOA_DATA
            .read()
            .map_err(|_| anyhow!("Failed to access cached moa data"))?;
        let moa = moa_data
            .get_by_id(moa_id)
            .ok_or_else(|| anyhow!("Unknown moa id: {moa_id}"))?;

        let path = build_paths(&moa.path, &moa.name);
        let moa_paths = ensure_layout(&path).await?;

        let mut paths = self.paths.write().await;
        Ok(paths
            .entry(moa_id.to_string())
            .or_insert_with(|| moa_paths.clone())
            .clone())
    }
}

/// Normalize the user-provided base path with the Moa project name.
pub fn build_paths(base: &str, name: &str) -> PathBuf {
    Path::new(base).join(name)
}

/// Ensure that the Moa layout exists on disk and return the derived paths.
pub async fn ensure_layout(base: &Path) -> Result<MoaPaths> {
    let moa_dir = base.join(MOA_DIR_NAME);
    fs::create_dir_all(&moa_dir).await.with_context(|| {
        format!("Failed to create .moa at {}", moa_dir.display())
    })?;

    let db_path = moa_dir.join(DB_FILE_NAME);
    let cfg_path = moa_dir.join(CFG_FILE_NAME);

    if !cfg_path.exists() {
        // open with create_new to avoid races
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&cfg_path)
            .await
            .with_context(|| {
                format!("Failed to create {}", cfg_path.display())
            })?;

        // build initial config
        let cfg = MoaConfig {
            app: "moa".to_string(),
            first: true,
            created_at: date::get_now_date(),
            database_version: crate::services::integrity::TARGET_DB_VERSION,
        };
        let cfg_bytes = serde_json::to_vec_pretty(&cfg)
            .context("Failed to serialize initial config.json")?;

        file.write_all(&cfg_bytes).await.with_context(|| {
            format!("Failed to write {}", cfg_path.display())
        })?;
        let _ = file.flush().await;
    }

    // .moa/.cached and thumbs
    let cached_dir = moa_dir.join(CACHED_DIR_NAME);
    let thumb_dir = cached_dir.join(THUMBS_DIR_NAME);

    fs::create_dir_all(&cached_dir).await.with_context(|| {
        format!("Failed to create {}", cached_dir.display())
    })?;
    fs::create_dir_all(&thumb_dir)
        .await
        .with_context(|| format!("Failed to create {}", thumb_dir.display()))?;

    Ok(MoaPaths {
        base_dir: base.to_path_buf(),
        moa_dir,
        db_path,
        cfg_path,
        thumb_dir,
        cached_dir,
    })
}

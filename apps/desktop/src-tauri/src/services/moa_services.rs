use std::{collections::HashMap, io::ErrorKind, path::Path, sync::RwLock};

use anyhow::{anyhow, Context, Result};
use once_cell::sync::Lazy;
use tokio::fs;

use crate::{
    bootstrap::build_paths,
    config::moa::Moa,
    utils::{identifier::get_unique_id, path_utils},
};

/// In-memory cache of persisted Moa metadata.
pub struct MoaData {
    pub moas: HashMap<String, Moa>,
}

/// Lazily initialized global cache of Moa metadata.
pub static MOA_DATA: Lazy<RwLock<MoaData>> =
    Lazy::new(|| RwLock::new(MoaData::new()));
impl MoaData {
    /// Create an empty cache.
    pub fn new() -> Self {
        MoaData { moas: HashMap::new() }
    }

    /// Look up a Moa by identifier.
    pub fn get_by_id(&self, moa_id: &str) -> Option<Moa> {
        self.moas.get(moa_id).cloned()
    }

    /// Add a single Moa to the cache if it is not already present.
    pub fn add(&mut self, moa: Moa) {
        if self.moas.contains_key(&moa.moa_id) {
            return;
        }
        self.moas.insert(moa.moa_id.clone(), moa);
    }

    /// Replace the cache contents with the provided slice of Moas.
    pub fn sync(&mut self, moas: &[Moa]) {
        self.moas.clear();
        for moa in moas {
            self.moas.insert(moa.moa_id.clone(), moa.clone());
        }
    }
}

/// Load all persisted Moa workspaces from disk.
pub async fn load_moas(app: &tauri::AppHandle) -> Result<Vec<Moa>> {
    let moa_file_path = path_utils::get_moa_file_path(app);

    let content = match fs::read_to_string(&moa_file_path).await {
        Ok(content) => content,
        Err(err) if err.kind() == ErrorKind::NotFound => {
            return Ok(Vec::new());
        }
        Err(err) => {
            return Err(anyhow!(
                "Failed to read {}: {err}",
                moa_file_path.display()
            ));
        }
    };

    let mut moas = serde_json::from_str::<Vec<Moa>>(&content)
        .context("Failed to parse stored moa list")?;
    moas.sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));

    let mut moa_data = MOA_DATA.write().unwrap();
    moa_data.sync(&moas);

    Ok(moas)
}

/// Load the most recently opened Moa, if any.
pub async fn load_latest_moas(app: &tauri::AppHandle) -> Result<Option<Moa>> {
    let moas = load_moas(app).await?;
    Ok(moas
        .into_iter()
        .filter(|moa| moa.last_opened_at.is_some())
        .max_by(|a, b| a.last_opened_at.cmp(&b.last_opened_at)))
}

/// Persist the provided Moa collection to disk.
pub async fn save_moas(app: &tauri::AppHandle, moas: &[Moa]) -> Result<()> {
    let moa_file_path = path_utils::get_moa_file_path(app);

    let file_content =
        serde_json::to_string(moas).context("Failed to serialize moas")?;

    if let Some(parent) = moa_file_path.parent() {
        fs::create_dir_all(parent).await.with_context(|| {
            format!("Failed to create {}", parent.display())
        })?;
    }

    fs::write(&moa_file_path, file_content).await.with_context(|| {
        format!("Failed to save moas: {}", moa_file_path.display())
    })
}

/// Create a new Moa workspace directory and append it to the cache.
pub async fn create_moa(app: &tauri::AppHandle, moa: &Moa) -> Result<Moa> {
    let mut moas = load_moas(app).await?;
    let path = moa.path.clone();
    let name = moa.name.clone();

    let full_path = build_paths(&path, &name);

    let metadata = fs::metadata(&path)
        .await
        .with_context(|| format!("Path '{}' does not exist.", path))?;
    if !metadata.is_dir() {
        return Err(anyhow!("Path '{}' is not a directory.", path));
    }

    if moas.iter().any(|m| m.name == name && m.path == path) {
        return Err(anyhow!(
            "Moa with name '{}' and path '{}' already exists.",
            name,
            path
        ));
    }

    fs::create_dir_all(&full_path).await.with_context(|| {
        format!("Failed to create folder '{}'", full_path.display())
    })?;

    let new_moa =
        Moa { name, path, last_opened_at: None, moa_id: get_unique_id() };

    moas.push(new_moa.clone());
    save_moas(app, &moas).await?;

    let mut moa_data = MOA_DATA.write().unwrap();
    moa_data.add(new_moa.clone());

    Ok(new_moa)
}

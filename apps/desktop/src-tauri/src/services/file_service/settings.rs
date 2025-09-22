use std::{collections::HashMap, io::ErrorKind, path::PathBuf};

use anyhow::{Context, Result};
use once_cell::sync::Lazy;
use tokio::{fs, sync::RwLock};

use crate::{
    bootstrap::PATH_MANAGER,
    models::file::{FileSettings, FileSettingsUpdate},
};

const SETTINGS_DIR_NAME: &str = "settings";
const SETTINGS_FILE_NAME: &str = "file.json";

static SETTINGS_CACHE: Lazy<RwLock<HashMap<String, FileSettings>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

async fn settings_paths(moa_id: &str) -> Result<(PathBuf, PathBuf)> {
    let paths = PATH_MANAGER
        .get_or_add(moa_id)
        .await
        .context("Failed to resolve workspace paths")?;

    let settings_dir = paths.moa_dir.join(SETTINGS_DIR_NAME);
    let file_path = settings_dir.join(SETTINGS_FILE_NAME);

    Ok((settings_dir, file_path))
}

async fn load_from_disk(moa_id: &str) -> Result<FileSettings> {
    let (_settings_dir, file_path) = settings_paths(moa_id).await?;

    match fs::read(&file_path).await {
        Ok(payload) => {
            let settings =
                serde_json::from_slice(&payload).with_context(|| {
                    format!(
                        "Failed to deserialize file settings at {}",
                        file_path.display()
                    )
                })?;
            Ok(settings)
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {
            Ok(FileSettings::default())
        }
        Err(error) => Err(error).with_context(|| {
            format!("Failed to read file settings from {}", file_path.display())
        }),
    }
}

async fn persist_to_disk(moa_id: &str, settings: &FileSettings) -> Result<()> {
    let (settings_dir, file_path) = settings_paths(moa_id).await?;

    fs::create_dir_all(&settings_dir).await.with_context(|| {
        format!(
            "Failed to create settings directory at {}",
            settings_dir.display()
        )
    })?;

    let payload = serde_json::to_vec_pretty(settings)
        .context("Failed to serialise file settings payload")?;

    fs::write(&file_path, payload).await.with_context(|| {
        format!("Failed to write file settings to {}", file_path.display())
    })?;

    Ok(())
}

pub async fn get_settings(moa_id: &str) -> Result<FileSettings> {
    if let Some(cached) = {
        let cache = SETTINGS_CACHE.read().await;
        cache.get(moa_id).cloned()
    } {
        return Ok(cached);
    }

    let settings = load_from_disk(moa_id).await?;

    {
        let mut cache = SETTINGS_CACHE.write().await;
        cache.insert(moa_id.to_string(), settings.clone());
    }

    Ok(settings)
}

pub async fn update_settings(
    moa_id: &str,
    update: FileSettingsUpdate,
) -> Result<FileSettings> {
    let mut current = get_settings(moa_id).await?;

    if let Some(value) = update.precache_base_thumbnails {
        current.precache_base_thumbnails = value;
    }

    persist_to_disk(moa_id, &current).await?;

    {
        let mut cache = SETTINGS_CACHE.write().await;
        cache.insert(moa_id.to_string(), current.clone());
    }

    Ok(current)
}

pub async fn set_settings(
    moa_id: &str,
    settings: FileSettings,
) -> Result<FileSettings> {
    persist_to_disk(moa_id, &settings).await?;

    {
        let mut cache = SETTINGS_CACHE.write().await;
        cache.insert(moa_id.to_string(), settings.clone());
    }

    Ok(settings)
}

pub async fn is_base_precache_enabled(moa_id: &str) -> Result<bool> {
    Ok(get_settings(moa_id).await?.precache_base_thumbnails)
}

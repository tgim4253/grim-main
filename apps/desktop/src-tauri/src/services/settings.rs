use std::io;

use anyhow::{Context, Result};
use tokio::fs;
use tracing::warn;

use crate::{bootstrap::MoaPaths, config::settings::MoaSettings};

/// Load workspace settings, falling back to defaults when files are missing or invalid.
pub async fn load(paths: &MoaPaths) -> Result<MoaSettings> {
    let read_result = fs::read(&paths.settings_path).await;

    if let Err(err) = &read_result {
        if err.kind() == io::ErrorKind::NotFound {
            let defaults = MoaSettings::default();
            save(paths, &defaults).await?;
            return Ok(defaults);
        }
    }

    let bytes = read_result.with_context(|| {
        format!("Failed to read {}", paths.settings_path.display())
    })?;

    if bytes.is_empty() {
        return Ok(MoaSettings::default());
    }

    match serde_json::from_slice::<MoaSettings>(&bytes) {
        Ok(settings) => Ok(settings),
        Err(err) => {
            warn!(
                "Failed to parse {}; recreating defaults: {err}",
                paths.settings_path.display()
            );
            let defaults = MoaSettings::default();
            save(paths, &defaults).await?;
            Ok(defaults)
        }
    }
}

/// Persist workspace settings, storing only user-provided overrides.
pub async fn save(paths: &MoaPaths, settings: &MoaSettings) -> Result<()> {
    let payload = settings.to_overrides();
    let bytes = serde_json::to_vec_pretty(&payload)
        .context("Failed to serialize workspace settings overrides")?;

    fs::write(&paths.settings_path, bytes).await.with_context(|| {
        format!("Failed to write {}", paths.settings_path.display())
    })
}

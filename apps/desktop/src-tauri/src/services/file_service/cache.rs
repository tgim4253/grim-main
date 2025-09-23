use std::{
    io::ErrorKind,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use tauri::{path::BaseDirectory, AppHandle, Manager};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbCacheUsage {
    pub base_bytes: u64,
    pub derived_bytes: u64,
    pub total_bytes: u64,
    pub base_files: u64,
    pub derived_files: u64,
    pub total_files: u64,
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
enum ThumbPurgeScope {
    Base,
    Derived,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ThumbPurgeEvent {
    scope: ThumbPurgeScope,
}

pub async fn collect_thumb_cache_usage(
    app: &AppHandle,
) -> Result<ThumbCacheUsage> {
    let root = cache_root(app)?;
    let (total_bytes, total_files) = compute_path_usage(root.as_path()).await?;
    let base_root = root.join("base");
    let (base_bytes, base_files) =
        compute_path_usage(base_root.as_path()).await?;

    let derived_bytes = total_bytes.saturating_sub(base_bytes);
    let derived_files = total_files.saturating_sub(base_files);

    Ok(ThumbCacheUsage {
        base_bytes,
        derived_bytes,
        total_bytes,
        base_files,
        derived_files,
        total_files,
    })
}

pub async fn clear_base_thumb_cache(app: &AppHandle) -> Result<()> {
    let root = cache_root(app)?;
    let base_path = root.join("base");
    remove_path(base_path.as_path()).await?;
    emit_thumb_purged(app, ThumbPurgeScope::Base)?;
    Ok(())
}

pub async fn clear_derived_thumb_cache(app: &AppHandle) -> Result<()> {
    let root = cache_root(app)?;
    let metadata = match tokio::fs::metadata(root.as_path()).await {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == ErrorKind::NotFound => {
            emit_thumb_purged(app, ThumbPurgeScope::Derived)?;
            return Ok(());
        }
        Err(err) => {
            return Err(err).context(format!(
                "failed to inspect thumbnail cache root: {}",
                root.display()
            ));
        }
    };

    if !metadata.is_dir() {
        remove_path(root.as_path()).await?;
        emit_thumb_purged(app, ThumbPurgeScope::Derived)?;
        return Ok(());
    }

    let mut entries = tokio::fs::read_dir(root.as_path())
        .await
        .context("failed to iterate thumbnail cache directory")?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .context("failed to iterate thumbnail cache directory")?
    {
        if entry.file_name() == "base" {
            continue;
        }
        let path = entry.path();
        remove_path(path.as_path()).await?;
    }

    emit_thumb_purged(app, ThumbPurgeScope::Derived)?;
    Ok(())
}

fn cache_root(app: &AppHandle) -> Result<PathBuf> {
    app.path()
        .resolve(PathBuf::from("thumbs"), BaseDirectory::AppCache)
        .context("failed to resolve thumbnail cache path")
}

async fn compute_path_usage(path: &Path) -> Result<(u64, u64)> {
    let metadata = match tokio::fs::metadata(path).await {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok((0, 0)),
        Err(err) => {
            return Err(err).context(format!(
                "failed to read metadata for {}",
                path.display()
            ));
        }
    };

    if metadata.is_file() {
        return Ok((metadata.len(), 1));
    }

    if !metadata.is_dir() {
        return Ok((0, 0));
    }

    collect_dir_usage(path).await
}

async fn collect_dir_usage(root: &Path) -> Result<(u64, u64)> {
    let mut total_bytes: u64 = 0;
    let mut total_files: u64 = 0;
    let mut stack = vec![root.to_path_buf()];

    while let Some(path) = stack.pop() {
        let mut entries = match tokio::fs::read_dir(path.as_path()).await {
            Ok(entries) => entries,
            Err(err) if err.kind() == ErrorKind::NotFound => continue,
            Err(err) => {
                return Err(err).context(format!(
                    "failed to read directory {}",
                    path.display()
                ));
            }
        };

        while let Some(entry) = entries
            .next_entry()
            .await
            .context(format!("failed to read entry in {}", path.display()))?
        {
            let entry_path = entry.path();
            let file_type = entry.file_type().await.context(format!(
                "failed to read file type for {}",
                entry_path.display()
            ))?;

            if file_type.is_dir() {
                stack.push(entry_path);
                continue;
            }

            if file_type.is_file() {
                let metadata = match entry.metadata().await {
                    Ok(metadata) => metadata,
                    Err(err) if err.kind() == ErrorKind::NotFound => continue,
                    Err(err) => {
                        return Err(err).context(format!(
                            "failed to read metadata for {}",
                            entry_path.display()
                        ));
                    }
                };

                total_bytes += metadata.len();
                total_files += 1;
                continue;
            }

            if file_type.is_symlink() {
                let metadata = match entry.metadata().await {
                    Ok(metadata) => metadata,
                    Err(err) if err.kind() == ErrorKind::NotFound => continue,
                    Err(err) => {
                        return Err(err).context(format!(
                            "failed to resolve symlink metadata for {}",
                            entry_path.display()
                        ));
                    }
                };

                if metadata.is_dir() {
                    stack.push(entry_path);
                } else if metadata.is_file() {
                    total_bytes += metadata.len();
                    total_files += 1;
                }
            }
        }
    }

    Ok((total_bytes, total_files))
}

async fn remove_path(path: &Path) -> Result<()> {
    match tokio::fs::metadata(path).await {
        Ok(metadata) => {
            if metadata.is_dir() {
                tokio::fs::remove_dir_all(path).await.context(format!(
                    "failed to remove directory {}",
                    path.display()
                ))?;
            } else {
                tokio::fs::remove_file(path).await.context(format!(
                    "failed to remove file {}",
                    path.display()
                ))?;
            }
        }
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(()),
        Err(err) => {
            return Err(err)
                .context(format!("failed to inspect {}", path.display()));
        }
    }

    Ok(())
}

fn emit_thumb_purged(app: &AppHandle, scope: ThumbPurgeScope) -> Result<()> {
    let payload = ThumbPurgeEvent { scope };
    app.emit("thumbnails://purged", payload)
        .context("failed to emit thumbnail purge event")
}

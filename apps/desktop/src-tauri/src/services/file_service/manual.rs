use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};
use serde::{Deserialize, Serialize};
use tokio::fs;
use uuid::Uuid;

use crate::{
    bootstrap::PATH_MANAGER,
    db::repository::node_repository::NodeRepository,
    models::connection::RelationType,
    models::file::{FileInfo, FileType},
    services::{
        connection_rules::{ensure_connections_for_nodes, load_engine_for_moa},
        db::DB_MANAGER,
        file_service::asset::ensure_file_asset_binding,
        settings, storage_root,
    },
    utils::{
        file_ops::{decode_data_url, ensure_unique_path, extension_from_mime},
        path_utils::normalize_path,
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelDropFile {
    pub name: String,
    #[serde(default)]
    pub mime_type: Option<String>,
    pub data_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelDropRequest {
    pub moa_id: String,
    pub virtual_node_id: String,
    #[serde(default)]
    pub urls: Vec<String>,
    #[serde(default)]
    pub base_urls: Vec<String>,
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(default)]
    pub files: Vec<PanelDropFile>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelDropResponse {
    pub imported: usize,
}

pub async fn import_panel_drop(
    payload: PanelDropRequest,
) -> Result<PanelDropResponse> {
    if payload.moa_id.trim().is_empty() {
        return Err(anyhow!("moa id is required"));
    }
    if payload.virtual_node_id.trim().is_empty() {
        return Err(anyhow!("virtual node id is required"));
    }

    let mut imported_paths: Vec<(PathBuf, bool)> = Vec::new();

    let requires_download_dir = !payload.urls.is_empty()
        || !payload.base_urls.is_empty()
        || !payload.files.is_empty();

    let download_dir = if requires_download_dir {
        Some(resolve_download_directory(&payload.moa_id).await?)
    } else {
        None
    };

    if let Some(dir) = download_dir.as_ref() {
        if !payload.base_urls.is_empty() {
            for path in persist_base_urls(dir, &payload.base_urls).await? {
                imported_paths.push((path, true));
            }
        }
        if !payload.files.is_empty() {
            for path in persist_uploaded_files(dir, &payload.files).await? {
                imported_paths.push((path, true));
            }
        }
    }

    if !payload.paths.is_empty() {
        for path in &payload.paths {
            let candidate = PathBuf::from(path);
            if candidate.exists() {
                imported_paths.push((candidate, false));
            }
        }
    }

    let mut imported_count = 0_usize;
    for (path, should_cleanup) in imported_paths.into_iter() {
        let imported = register_path_with_virtual_folder(
            &payload.moa_id,
            &payload.virtual_node_id,
            &path,
        )
        .await?;

        if imported {
            imported_count = imported_count.saturating_add(1);
        } else if should_cleanup {
            let _ = fs::remove_file(&path).await;
        }
    }

    Ok(PanelDropResponse { imported: imported_count })
}

async fn resolve_download_directory(moa_id: &str) -> Result<PathBuf> {
    let paths = PATH_MANAGER
        .get_or_add(moa_id)
        .await
        .context("failed to resolve moa paths")?;
    let workspace_settings = settings::load(&paths).await?;
    let download_dir =
        workspace_settings.effective_download_dir(&paths.base_dir);
    fs::create_dir_all(&download_dir).await.with_context(|| {
        format!(
            "failed to create download directory at {}",
            download_dir.display()
        )
    })?;
    Ok(download_dir)
}

async fn persist_base_urls(
    dir: &Path,
    base_urls: &[String],
) -> Result<Vec<PathBuf>> {
    let mut out = Vec::with_capacity(base_urls.len());
    for payload in base_urls {
        let (bytes, hint_extension) = decode_data_url(payload)?;
        let extension = hint_extension
            .or_else(|| infer_extension(&bytes))
            .unwrap_or_else(|| "bin".to_string());
        let file_name = generate_default_name("drop");
        let target_path =
            ensure_unique_path(dir.join(format!("{file_name}.{extension}")))
                .await?;
        fs::write(&target_path, &bytes).await.with_context(|| {
            format!(
                "failed to persist dropped data url to {}",
                target_path.display()
            )
        })?;
        out.push(target_path);
    }

    Ok(out)
}

async fn persist_uploaded_files(
    dir: &Path,
    files: &[PanelDropFile],
) -> Result<Vec<PathBuf>> {
    let mut out = Vec::with_capacity(files.len());

    for file in files {
        let bytes =
            BASE64_STANDARD.decode(file.data_base64.trim()).map_err(|err| {
                anyhow!("failed to decode dropped file {}: {err}", file.name)
            })?;

        let sanitized_name = sanitize_file_name(&file.name);
        let has_extension = Path::new(&sanitized_name).extension().is_some();
        let extension_hint =
            file.mime_type.as_deref().and_then(extension_from_mime);
        let final_name = if has_extension {
            sanitized_name.clone()
        } else {
            apply_extension(&sanitized_name, extension_hint.as_deref())
        };

        let target_path = ensure_unique_path(dir.join(&final_name)).await?;
        fs::write(&target_path, &bytes).await.with_context(|| {
            format!(
                "failed to persist dropped file {} to {}",
                file.name,
                target_path.display()
            )
        })?;
        out.push(target_path);
    }

    Ok(out)
}

async fn register_path_with_virtual_folder(
    moa_id: &str,
    virtual_node_id: &str,
    path: &Path,
) -> Result<bool> {
    let normalized = normalize_path(path);
    if !normalized.exists() {
        return Err(anyhow!("{} does not exist", normalized.display()));
    }

    let parent = normalized.parent().ok_or_else(|| {
        anyhow!("{} has no parent directory", normalized.display())
    })?;
    let parent_norm = normalize_path(parent);

    let sroot_info = storage_root::detect_storage_root(&parent_norm)
        .with_context(|| {
            format!(
                "failed to detect storage root for {}",
                parent_norm.display()
            )
        })?;

    let mut tx = DB_MANAGER
        .create_new_tx(moa_id)
        .await
        .context("failed to open transaction")?;

    let real_folder_id = storage_root::ensure_storage_root_and_real_folder(
        &mut tx,
        &sroot_info,
        &parent_norm,
    )
    .await
    .with_context(|| {
        format!("failed to ensure real folder for {}", parent_norm.display())
    })?;

    let file_name = normalized
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            anyhow!("invalid file name for {}", normalized.display())
        })?
        .to_string();

    let file_info =
        FileInfo::new(moa_id, &normalized, real_folder_id.clone(), file_name)
            .await
            .with_context(|| {
                format!(
                    "failed to compute file metadata for {}",
                    normalized.display()
                )
            })?;

    if file_info.kind_guess != FileType::Image {
        tx.rollback()
            .await
            .context("failed to rollback skipped file import transaction")?;
        return Ok(false);
    }

    let engine = load_engine_for_moa(moa_id)
        .await
        .context("failed to load connection rules")?;

    let (asset_id, _) = ensure_file_asset_binding(&mut tx, &file_info)
        .await
        .context("failed to upsert file asset binding")?;

    let file_node_id =
        NodeRepository::upsert_file_node(tx.as_mut(), asset_id.clone())
            .await
            .context("failed to ensure file node")?;

    ensure_connections_for_nodes(
        tx.as_mut(),
        &engine,
        virtual_node_id,
        &file_node_id,
        (Some(RelationType::ContainsFile), Some(RelationType::BelongToFolder)),
        None,
        false,
    )
    .await
    .context("failed to link file to virtual folder")?;

    tx.commit().await.context("failed to commit file import transaction")?;

    Ok(true)
}

fn infer_extension(bytes: &[u8]) -> Option<String> {
    infer::get(bytes).map(|kind| kind.extension().to_string())
}

fn apply_extension(name: &str, extension: Option<&str>) -> String {
    if let Some(ext) = extension.filter(|ext| !ext.is_empty()) {
        if name.to_lowercase().ends_with(&format!(".{ext}")) {
            return sanitize_file_name(name);
        }
        return format!("{}.{ext}", sanitize_file_name(name));
    }
    sanitize_file_name(name)
}

fn sanitize_file_name(name: &str) -> String {
    let invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let mut sanitized: String = name
        .chars()
        .map(|c| if invalid.contains(&c) { '_' } else { c })
        .collect();
    sanitized = sanitized.trim_matches('.').trim().to_string();
    if sanitized.is_empty() {
        generate_default_name("download")
    } else {
        sanitized
    }
}

fn generate_default_name(prefix: &str) -> String {
    format!("{prefix}-{}", Uuid::new_v4())
}

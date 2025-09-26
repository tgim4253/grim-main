use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::fs;
use uuid::Uuid;

use crate::{
    bootstrap::PATH_MANAGER,
    db::repository::{
        file_repository::FileRepository, node_repository::NodeRepository,
    },
    models::file::FileInfo,
    services::{db::DB_MANAGER, storage_root},
    utils::path_utils::normalize_path,
};

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

    let mut imported_paths: Vec<PathBuf> = Vec::new();

    if !payload.urls.is_empty() || !payload.base_urls.is_empty() {
        let download_dir = resolve_download_directory(&payload.moa_id).await?;
        if !payload.urls.is_empty() {
            imported_paths.extend(
                download_remote_assets(&download_dir, &payload.urls).await?,
            );
        }
        if !payload.base_urls.is_empty() {
            imported_paths.extend(
                persist_base_urls(&download_dir, &payload.base_urls).await?,
            );
        }
    }

    if !payload.paths.is_empty() {
        for path in payload.paths {
            let candidate = PathBuf::from(path);
            if candidate.exists() {
                imported_paths.push(candidate);
            }
        }
    }

    let mut imported_count = 0_usize;
    for path in imported_paths {
        register_path_with_virtual_folder(
            &payload.moa_id,
            &payload.virtual_node_id,
            &path,
        )
        .await?;
        imported_count = imported_count.saturating_add(1);
    }

    Ok(PanelDropResponse { imported: imported_count })
}

async fn resolve_download_directory(moa_id: &str) -> Result<PathBuf> {
    let paths = PATH_MANAGER
        .get_or_add(moa_id)
        .await
        .context("failed to resolve moa paths")?;
    let download_dir = paths.base_dir.join("download");
    fs::create_dir_all(&download_dir).await.with_context(|| {
        format!(
            "failed to create download directory at {}",
            download_dir.display()
        )
    })?;
    Ok(download_dir)
}

async fn download_remote_assets(
    dir: &Path,
    urls: &[String],
) -> Result<Vec<PathBuf>> {
    let client = Client::new();
    let mut out = Vec::with_capacity(urls.len());

    for url in urls {
        let response = client
            .get(url)
            .send()
            .await
            .with_context(|| format!("failed to download {url}"))?
            .error_for_status()
            .with_context(|| {
                format!("unexpected response while downloading {url}")
            })?;

        let bytes = response.bytes().await.with_context(|| {
            format!("failed to read response body for {url}")
        })?;

        let file_name = derive_file_name_from_url(url)
            .unwrap_or_else(|| generate_default_name("download"));
        let extension = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .and_then(extract_extension_from_mime)
            .or_else(|| infer_extension(bytes.as_ref()));

        let target_path = ensure_unique_path(
            dir.join(apply_extension(&file_name, extension.as_deref())),
        )
        .await?;
        fs::write(&target_path, &bytes).await.with_context(|| {
            format!("failed to persist {url} to {}", target_path.display())
        })?;
        out.push(target_path);
    }

    Ok(out)
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

async fn register_path_with_virtual_folder(
    moa_id: &str,
    virtual_node_id: &str,
    path: &Path,
) -> Result<()> {
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
        tx.as_mut(),
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

    let file_path_id =
        FileRepository::insert_file_path(tx.as_mut(), &file_info)
            .await
            .context("failed to insert file path")?;

    let file_content_id =
        FileRepository::upsert_file_content(tx.as_mut(), &file_info)
            .await
            .context("failed to upsert file content")?;

    FileRepository::upsert_file_path_content_binding(
        tx.as_mut(),
        &file_path_id,
        &file_content_id,
    )
    .await
    .context("failed to upsert file path binding")?;

    NodeRepository::upsert_file_node(
        tx.as_mut(),
        virtual_node_id.to_string(),
        file_content_id.clone(),
    )
    .await
    .context("failed to associate file node with virtual folder")?;

    tx.commit().await.context("failed to commit file import transaction")?;

    Ok(())
}

fn derive_file_name_from_url(url: &str) -> Option<String> {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| {
            parsed.path_segments().and_then(|mut segments| {
                segments.next_back().map(|segment| segment.to_string())
            })
        })
        .map(|name| sanitize_file_name(&name))
        .filter(|name| !name.is_empty())
}

fn extract_extension_from_mime(mime: &str) -> Option<String> {
    mime.split('/')
        .nth(1)
        .and_then(|segment| segment.split(';').next())
        .map(|ext| ext.trim().to_string())
        .filter(|ext| !ext.is_empty())
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

async fn ensure_unique_path(path: PathBuf) -> Result<PathBuf> {
    if fs::metadata(&path).await.is_err() {
        return Ok(path);
    }

    let mut base = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .map(|stem| stem.to_string())
        .unwrap_or_else(|| generate_default_name("download"));
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_string());
    let parent = path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));

    for index in 1..10_000 {
        let mut candidate = parent.join(format!("{base}-{index}"));
        if let Some(ext) = extension.as_deref() {
            candidate.set_extension(ext);
        }
        if fs::metadata(&candidate).await.is_err() {
            return Ok(candidate);
        }
    }

    Err(anyhow!("unable to generate unique path for {}", path.display()))
}

fn decode_data_url(payload: &str) -> Result<(Vec<u8>, Option<String>)> {
    let (header, data) = payload
        .split_once(',')
        .ok_or_else(|| anyhow!("invalid data url payload"))?;

    let mime = header
        .strip_prefix("data:")
        .and_then(|value| value.split(';').next())
        .map(|value| value.to_string());

    if !header.contains(";base64") {
        return Err(anyhow!("unsupported data url encoding"));
    }

    let bytes = BASE64_STANDARD
        .decode(data.trim())
        .map_err(|err| anyhow!("failed to decode data url payload: {err}"))?;

    let extension = mime.and_then(|mime| extract_extension_from_mime(&mime));

    Ok((bytes, extension))
}

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};
use tokio::fs;

/// Ensure the provided path does not collide with an existing file by appending an index suffix.
pub async fn ensure_unique_path(path: PathBuf) -> Result<PathBuf> {
    if fs::metadata(&path).await.is_err() {
        return Ok(path);
    }

    let parent = path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or("file")
        .to_string();
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    for index in 1..10_000 {
        let mut candidate = parent.join(format!("{stem}-{index}"));
        if let Some(ext) = extension.as_deref() {
            candidate.set_extension(ext);
        }

        if fs::metadata(&candidate).await.is_err() {
            return Ok(candidate);
        }
    }

    Err(anyhow!("unable to generate unique path for {}", path.display()))
}

/// Decode a base64 data URL, returning the raw bytes and an optional extension hint.
pub fn decode_data_url(payload: &str) -> Result<(Vec<u8>, Option<String>)> {
    let (header, data) = payload
        .split_once(',')
        .ok_or_else(|| anyhow!("invalid data url payload"))?;

    if !header.contains(";base64") {
        return Err(anyhow!("unsupported data url encoding"));
    }

    let mime = header
        .strip_prefix("data:")
        .and_then(|value| value.split(';').next())
        .map(|value| value.to_string());

    let bytes = BASE64_STANDARD
        .decode(data.trim())
        .map_err(|err| anyhow!("failed to decode data url payload: {err}"))?;

    let extension = mime.as_deref().and_then(extension_from_mime);

    Ok((bytes, extension))
}

/// Extract a file extension (without leading dot) from a MIME string.
pub fn extension_from_mime(mime: &str) -> Option<String> {
    mime.split('/')
        .nth(1)
        .and_then(|segment| segment.split(';').next())
        .map(|ext| ext.trim().to_string())
        .filter(|ext| !ext.is_empty())
}

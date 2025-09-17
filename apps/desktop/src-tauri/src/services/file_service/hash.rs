use std::{hash::Hasher, path::Path};

use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, BufReader};
use twox_hash::XxHash64;

use crate::models::file::FileType;

/// Compute the SHA256 hash of a file asynchronously.
async fn sha256_of(path: &Path) -> Result<String> {
    let file = tokio::fs::File::open(path)
        .await
        .with_context(|| format!("Failed to open {}", path.display()))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

/// Compute the SHA256 hash of an image file, validating the input first.
pub async fn sha256_of_img(path: &Path) -> Result<String> {
    if !matches!(FileType::from(path), FileType::Image) {
        bail!("Not an image file: {}", path.display());
    }
    FileType::check_is_img(path)?;
    sha256_of(path).await
}

/// Compute the xxHash64 digest of the given file asynchronously.
pub async fn xxh3_64_of(path: &Path) -> Result<String> {
    let file = tokio::fs::File::open(path)
        .await
        .with_context(|| format!("Failed to open {}", path.display()))?;
    let mut reader = BufReader::new(file);
    let mut hasher = XxHash64::default();
    let mut buffer = [0u8; 8192];

    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        hasher.write(&buffer[..read]);
    }

    Ok(format!("{:016x}", hasher.finish()))
}

/// Compute the xxHash64 digest of an image file.
#[allow(dead_code)]
pub async fn xxh3_64_of_img(path: &Path) -> Result<String> {
    if !matches!(FileType::from(path), FileType::Image) {
        bail!("Not an image file: {}", path.display());
    }
    FileType::check_is_img(path)?;
    xxh3_64_of(path).await
}

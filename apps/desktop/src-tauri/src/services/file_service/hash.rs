use std::{hash::Hasher, path::Path};

use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, BufReader};
use twox_hash::XxHash64;

use crate::{
    db::repository::file_repository::FileRepository, models::file::FileType,
    services::db::DB_MANAGER,
};

/// Compute the SHA256 hash of a file asynchronously.
/// dead
#[allow(dead_code)]
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
#[allow(dead_code)]
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

pub async fn fetch_hash_by_file_info(
    moa_id: &str,
    real_folder_id: &str,
    file_name_norm: &str,
    mtime: i64,
) -> Result<Option<String>> {
    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let file_path_id = FileRepository::fetch_file_path_by_info(
        tx.as_mut(),
        real_folder_id,
        file_name_norm,
        mtime,
    )
    .await?;

    let Some(file_path_id) = file_path_id else {
        return Ok(None);
    };

    let file_info =
        FileRepository::fetch_file_info(tx.as_mut(), &file_path_id).await?;

    let Some(file_info) = file_info else {
        return Ok(None);
    };
    let xxh3_64 = file_info.xxh3_64;

    tx.commit().await?;

    Ok(Some(xxh3_64))
}

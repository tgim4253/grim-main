use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use tokio::fs;

use crate::{
    models::library::{AssetSummary, ImportRequest, ImportResult},
    services::media_service,
    utils::{
        date::get_now_date, file_ops::ensure_unique_path,
        file_utils::file_mtime_epoch, identifier::get_unique_id,
    },
};

use super::super::{
    mappers::asset_from_row,
    runtime::{library_paths, pool},
};
use super::{
    read::{get_asset, load_asset_by_external_path, load_asset_by_hash},
    write::assign_asset_folders_and_tags,
};

async fn import_image_asset(
    request: &ImportRequest,
    file_path: &str,
) -> Result<Option<(AssetSummary, bool)>> {
    let pool = pool()?;
    let paths = library_paths()?;
    let source = PathBuf::from(file_path);
    if !media_service::is_supported_image(&source) {
        return Ok(None);
    }

    let metadata = fs::metadata(&source).await.with_context(|| {
        format!("Failed to read metadata for {}", source.display())
    })?;
    if !metadata.is_file() {
        return Ok(None);
    }

    let hash = media_service::hash_file(&source).await?;
    if let Some(existing) = load_asset_by_hash(&hash).await? {
        let mut tx = pool.begin().await?;
        assign_asset_folders_and_tags(
            &mut tx,
            &existing.id,
            &request.virtual_folder_ids,
            &request.tag_ids,
        )
        .await?;
        tx.commit().await?;
        return Ok(Some((get_asset(&existing.id).await?.asset, true)));
    }

    let file_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| anyhow!("Invalid file name: {}", source.display()))?
        .to_string();
    let destination =
        media_service::target_asset_path(&paths.asset_dir, &hash, &source);
    if fs::metadata(&destination).await.is_err() {
        media_service::copy_file(&source, &destination).await?;
    }

    let thumb_path = media_service::thumbnail_path(&paths.thumb_dir, &hash);
    let _ = media_service::ensure_thumbnail(&destination, &thumb_path).await?;
    let (width, height) = media_service::image_dimensions(&destination).await?;
    let modified_at = file_mtime_epoch(&metadata).ok();
    let now = get_now_date();
    let asset_id = get_unique_id();

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        INSERT INTO asset
        (id, type, hash, storage_path, external_path, thumbnail_path, file_name,
         file_size, mime_type, width, height, modified_at, created_at, updated_at)
        VALUES (?1, 'imported_image', ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
        "#,
    )
    .bind(&asset_id)
    .bind(&hash)
    .bind(destination.to_string_lossy().to_string())
    .bind(thumb_path.to_string_lossy().to_string())
    .bind(&file_name)
    .bind(metadata.len() as i64)
    .bind(media_service::source_mime(&source))
    .bind(width as i64)
    .bind(height as i64)
    .bind(modified_at)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    assign_asset_folders_and_tags(
        &mut tx,
        &asset_id,
        &request.virtual_folder_ids,
        &request.tag_ids,
    )
    .await?;
    tx.commit().await?;

    Ok(Some((get_asset(&asset_id).await?.asset, false)))
}

pub async fn import_images(request: ImportRequest) -> Result<ImportResult> {
    let mut imported = 0_usize;
    let mut reused = 0_usize;
    let mut assets = Vec::new();

    for file_path in &request.file_paths {
        if let Some((asset, is_reused)) =
            import_image_asset(&request, file_path).await?
        {
            if is_reused {
                reused += 1;
            } else {
                imported += 1;
            }
            assets.push(asset);
        }
    }

    Ok(ImportResult { imported, reused, linked: 0, assets })
}

async fn link_external_asset(
    request: &ImportRequest,
    file_path: &str,
) -> Result<Option<(AssetSummary, bool)>> {
    let pool = pool()?;
    let paths = library_paths()?;
    let source = PathBuf::from(file_path);
    let metadata = fs::metadata(&source).await.with_context(|| {
        format!("Failed to read metadata for {}", source.display())
    })?;
    if !metadata.is_file() {
        return Ok(None);
    }

    if let Some(existing) = load_asset_by_external_path(file_path).await? {
        let mut tx = pool.begin().await?;
        assign_asset_folders_and_tags(
            &mut tx,
            &existing.id,
            &request.virtual_folder_ids,
            &request.tag_ids,
        )
        .await?;
        tx.commit().await?;
        return Ok(Some((get_asset(&existing.id).await?.asset, true)));
    }

    let file_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| anyhow!("Invalid file name: {}", source.display()))?
        .to_string();

    let mime = media_service::source_mime(&source);
    let modified_at = file_mtime_epoch(&metadata).ok();
    let now = get_now_date();
    let asset_id = get_unique_id();

    let (thumbnail_path, width, height) =
        if media_service::is_supported_image(&source) {
            let hash = media_service::hash_file(&source).await?;
            let thumb_path =
                media_service::thumbnail_path(&paths.thumb_dir, &hash);
            let _ =
                media_service::ensure_thumbnail(&source, &thumb_path).await?;
            let (width, height) =
                media_service::image_dimensions(&source).await?;
            (
                Some(thumb_path.to_string_lossy().to_string()),
                Some(width as i64),
                Some(height as i64),
            )
        } else {
            (None, None, None)
        };

    let mut tx = pool.begin().await?;
    sqlx::query(
        r#"
        INSERT INTO asset
        (id, type, hash, storage_path, external_path, thumbnail_path, file_name,
         file_size, mime_type, width, height, modified_at, created_at, updated_at)
        VALUES (?1, 'linked_external', NULL, NULL, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
        "#,
    )
    .bind(&asset_id)
    .bind(file_path)
    .bind(thumbnail_path.as_deref())
    .bind(&file_name)
    .bind(metadata.len() as i64)
    .bind(mime)
    .bind(width)
    .bind(height)
    .bind(modified_at)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    assign_asset_folders_and_tags(
        &mut tx,
        &asset_id,
        &request.virtual_folder_ids,
        &request.tag_ids,
    )
    .await?;
    tx.commit().await?;

    Ok(Some((get_asset(&asset_id).await?.asset, false)))
}

pub async fn link_external_files(
    request: ImportRequest,
) -> Result<ImportResult> {
    let mut linked = 0_usize;
    let mut reused = 0_usize;
    let mut assets = Vec::new();

    for file_path in &request.file_paths {
        if let Some((asset, is_reused)) =
            link_external_asset(&request, file_path).await?
        {
            if is_reused {
                reused += 1;
            } else {
                linked += 1;
            }
            assets.push(asset);
        }
    }

    Ok(ImportResult { imported: 0, reused, linked, assets })
}

pub async fn import_capture_result(
    bytes: &[u8],
    file_name: &str,
) -> Result<AssetSummary> {
    let pool = pool()?;
    let paths = library_paths()?;
    let hash = media_service::hash_bytes(bytes);
    if let Some(existing) = load_asset_by_hash(&hash).await? {
        return Ok(existing);
    }

    let tmp_file = ensure_unique_path(paths.tmp_dir.join(file_name)).await?;
    media_service::persist_bytes(&tmp_file, bytes).await?;

    let destination =
        media_service::target_asset_path(&paths.asset_dir, &hash, &tmp_file);
    if fs::metadata(&destination).await.is_err() {
        media_service::copy_file(&tmp_file, &destination).await?;
    }

    let thumb_path = media_service::thumbnail_path(&paths.thumb_dir, &hash);
    media_service::ensure_thumbnail(&destination, &thumb_path).await?;
    let (width, height) = media_service::image_dimensions(&destination).await?;
    let metadata = fs::metadata(&destination).await?;
    let now = get_now_date();
    let asset_id = get_unique_id();

    sqlx::query(
        r#"
        INSERT INTO asset
        (id, type, hash, storage_path, external_path, thumbnail_path, file_name,
         file_size, mime_type, width, height, modified_at, created_at, updated_at)
        VALUES (?1, 'imported_image', ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10, ?10)
        "#,
    )
    .bind(&asset_id)
    .bind(&hash)
    .bind(destination.to_string_lossy().to_string())
    .bind(thumb_path.to_string_lossy().to_string())
    .bind(file_name)
    .bind(metadata.len() as i64)
    .bind(media_service::source_mime(&destination))
    .bind(width as i64)
    .bind(height as i64)
    .bind(&now)
    .execute(&pool)
    .await?;

    let _ = fs::remove_file(&tmp_file).await;

    let row = sqlx::query(
        r#"
        SELECT id, type, hash, storage_path, external_path, thumbnail_path, file_name,
               file_size, mime_type, width, height, modified_at, created_at, updated_at
        FROM asset
        WHERE id = ?1
        "#,
    )
    .bind(&asset_id)
    .fetch_one(&pool)
    .await?;
    asset_from_row(row)
}

use std::path::PathBuf;

use anyhow::Result;

use crate::models::library::{
    AssetDetail, AssetListSource, AssetSummary, CroquisRecordSummary, Tag,
    VirtualFolder,
};

use super::super::{
    mappers::{
        asset_from_row, folder_from_row, record_summary_from_row, tag_from_row,
    },
    runtime::pool,
};

pub(in crate::services::library_service) async fn count_all_assets(
) -> Result<i64> {
    let pool = pool()?;
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM asset")
        .fetch_one(&pool)
        .await?;
    Ok(count)
}

pub(in crate::services::library_service) async fn count_uncategorized_assets(
) -> Result<i64> {
    let pool = pool()?;
    let count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM asset
        WHERE id NOT IN (SELECT asset_id FROM asset_virtual_folder)
        "#,
    )
    .fetch_one(&pool)
    .await?;
    Ok(count)
}

pub async fn list_assets(source: AssetListSource) -> Result<Vec<AssetSummary>> {
    let pool = pool()?;
    let rows = match source {
        AssetListSource::AllAssets => {
            sqlx::query(
                r#"
                SELECT id, type, hash, storage_path, external_path, thumbnail_path, file_name,
                       file_size, mime_type, width, height, modified_at, created_at, updated_at
                FROM asset
                ORDER BY updated_at DESC, created_at DESC
                "#,
            )
            .fetch_all(&pool)
            .await?
        }
        AssetListSource::Uncategorized => {
            sqlx::query(
                r#"
                SELECT id, type, hash, storage_path, external_path, thumbnail_path, file_name,
                       file_size, mime_type, width, height, modified_at, created_at, updated_at
                FROM asset
                WHERE id NOT IN (SELECT asset_id FROM asset_virtual_folder)
                ORDER BY updated_at DESC, created_at DESC
                "#,
            )
            .fetch_all(&pool)
            .await?
        }
        AssetListSource::Folder { folder_id } => {
            sqlx::query(
                r#"
                SELECT a.id, a.type, a.hash, a.storage_path, a.external_path, a.thumbnail_path,
                       a.file_name, a.file_size, a.mime_type, a.width, a.height, a.modified_at,
                       a.created_at, a.updated_at
                FROM asset a
                INNER JOIN asset_virtual_folder avf ON avf.asset_id = a.id
                WHERE avf.virtual_folder_id = ?1
                ORDER BY a.updated_at DESC, a.created_at DESC
                "#,
            )
            .bind(folder_id)
            .fetch_all(&pool)
            .await?
        }
    };

    rows.into_iter().map(asset_from_row).collect()
}

pub async fn get_asset(asset_id: &str) -> Result<AssetDetail> {
    let pool = pool()?;
    let asset_row = sqlx::query(
        r#"
        SELECT id, type, hash, storage_path, external_path, thumbnail_path, file_name,
               file_size, mime_type, width, height, modified_at, created_at, updated_at
        FROM asset
        WHERE id = ?1
        "#,
    )
    .bind(asset_id)
    .fetch_one(&pool)
    .await?;
    let asset = asset_from_row(asset_row)?;

    let folder_rows = sqlx::query(
        r#"
        SELECT vf.id, vf.parent_id, vf.name, vf.full_path, vf.alias, vf.sort_order, vf.created_at, vf.updated_at
        FROM virtual_folder vf
        INNER JOIN asset_virtual_folder avf ON avf.virtual_folder_id = vf.id
        WHERE avf.asset_id = ?1
        ORDER BY vf.full_path ASC
        "#,
    )
    .bind(asset_id)
    .fetch_all(&pool)
    .await?;

    let tag_rows = sqlx::query(
        r#"
        SELECT t.id, t.group_id, t.name, t.color, t.sort_order, t.created_at, t.updated_at
        FROM tag t
        INNER JOIN asset_tag at ON at.tag_id = t.id
        WHERE at.asset_id = ?1
        ORDER BY t.name ASC
        "#,
    )
    .bind(asset_id)
    .fetch_all(&pool)
    .await?;

    let record_rows = sqlx::query(
        r#"
        SELECT id, title, source_asset_id, result_asset_id, session_id, step_index, step_name,
               target_duration_seconds, started_at, finished_at, finalized_at, created_at, updated_at
        FROM croquis_record
        WHERE source_asset_id = ?1 OR result_asset_id = ?1
        ORDER BY created_at DESC
        LIMIT 24
        "#,
    )
    .bind(asset_id)
    .fetch_all(&pool)
    .await?;

    Ok(AssetDetail {
        asset,
        virtual_folders: folder_rows
            .into_iter()
            .map(folder_from_row)
            .collect::<Result<Vec<VirtualFolder>>>()?,
        tags: tag_rows
            .into_iter()
            .map(tag_from_row)
            .collect::<Result<Vec<Tag>>>()?,
        related_records: record_rows
            .into_iter()
            .map(record_summary_from_row)
            .collect::<Result<Vec<CroquisRecordSummary>>>()?,
    })
}

pub(super) async fn load_asset_by_hash(
    hash: &str,
) -> Result<Option<AssetSummary>> {
    let pool = pool()?;
    let row = sqlx::query(
        r#"
        SELECT id, type, hash, storage_path, external_path, thumbnail_path, file_name,
               file_size, mime_type, width, height, modified_at, created_at, updated_at
        FROM asset
        WHERE type = 'imported_image' AND hash = ?1
        "#,
    )
    .bind(hash)
    .fetch_optional(&pool)
    .await?;

    row.map(asset_from_row).transpose()
}

pub(super) async fn load_asset_by_external_path(
    path: &str,
) -> Result<Option<AssetSummary>> {
    let pool = pool()?;
    let row = sqlx::query(
        r#"
        SELECT id, type, hash, storage_path, external_path, thumbnail_path, file_name,
               file_size, mime_type, width, height, modified_at, created_at, updated_at
        FROM asset
        WHERE type = 'linked_external' AND external_path = ?1
        "#,
    )
    .bind(path)
    .fetch_optional(&pool)
    .await?;

    row.map(asset_from_row).transpose()
}

fn asset_source_path(asset: &AssetSummary) -> Option<PathBuf> {
    asset
        .storage_path
        .as_deref()
        .or(asset.external_path.as_deref())
        .map(PathBuf::from)
}

pub async fn load_assets_by_ids(
    asset_ids: &[String],
) -> Result<Vec<AssetSummary>> {
    let mut assets = Vec::new();
    for asset_id in asset_ids {
        assets.push(get_asset(asset_id).await?.asset);
    }
    Ok(assets)
}

pub fn resolve_asset_source_path(asset: &AssetSummary) -> Option<PathBuf> {
    asset_source_path(asset)
}

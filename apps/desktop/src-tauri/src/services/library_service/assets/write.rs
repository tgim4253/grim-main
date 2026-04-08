use std::path::Path;

use anyhow::Result;
use sqlx::Sqlite;

use crate::{
    models::library::{
        AssetDetail, UpdateAssetFoldersPayload, UpdateAssetTagsPayload,
    },
    utils::date::get_now_date,
};

use super::super::runtime::pool;
use super::read::get_asset;

pub(super) async fn assign_asset_folders_and_tags(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    asset_id: &str,
    virtual_folder_ids: &[String],
    tag_ids: &[String],
) -> Result<()> {
    for folder_id in virtual_folder_ids {
        sqlx::query(
            r#"
            INSERT OR IGNORE INTO asset_virtual_folder
            (asset_id, virtual_folder_id, source_type, created_at)
            VALUES (?1, ?2, 'manual', ?3)
            "#,
        )
        .bind(asset_id)
        .bind(folder_id)
        .bind(get_now_date())
        .execute(&mut **tx)
        .await?;
    }

    for tag_id in tag_ids {
        sqlx::query(
            r#"
            INSERT OR IGNORE INTO asset_tag
            (asset_id, tag_id, created_at)
            VALUES (?1, ?2, ?3)
            "#,
        )
        .bind(asset_id)
        .bind(tag_id)
        .bind(get_now_date())
        .execute(&mut **tx)
        .await?;
    }

    Ok(())
}

pub async fn update_asset_folders(
    payload: UpdateAssetFoldersPayload,
) -> Result<AssetDetail> {
    let pool = pool()?;
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM asset_virtual_folder WHERE asset_id = ?1")
        .bind(&payload.asset_id)
        .execute(&mut *tx)
        .await?;
    assign_asset_folders_and_tags(
        &mut tx,
        &payload.asset_id,
        &payload.virtual_folder_ids,
        &[],
    )
    .await?;
    tx.commit().await?;
    get_asset(&payload.asset_id).await
}

pub async fn update_asset_tags(
    payload: UpdateAssetTagsPayload,
) -> Result<AssetDetail> {
    let pool = pool()?;
    let now = get_now_date();
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM asset_tag WHERE asset_id = ?1")
        .bind(&payload.asset_id)
        .execute(&mut *tx)
        .await?;

    for tag_id in &payload.tag_ids {
        sqlx::query(
            "INSERT OR IGNORE INTO asset_tag (asset_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
        )
        .bind(&payload.asset_id)
        .bind(tag_id)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    get_asset(&payload.asset_id).await
}

pub async fn reveal_path(path: &Path) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg("-R").arg(path).status()?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(path)
            .status()?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let target = path.parent().unwrap_or(path);
        std::process::Command::new("xdg-open").arg(target).status()?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Ok(())
}

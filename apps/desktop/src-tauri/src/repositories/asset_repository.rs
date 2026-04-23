use anyhow::Result;
use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::{
    models::{
        asset::{AssetDetail, AssetListSource, AssetSummary},
        folder::VirtualFolder,
        record::CroquisRecordSummary,
        tag::Tag,
    },
    utils::date::get_now_date,
};

use super::mappers::{
    asset_from_row, folder_from_row, record_summary_from_row, tag_from_row,
    AssetRow, CroquisRecordSummaryRow, TagRow, VirtualFolderRow,
};

#[derive(Clone)]
pub struct AssetRepository {
    pool: SqlitePool,
}

pub struct NewImportedAssetInput<'a> {
    pub id: &'a str,
    pub hash: &'a str,
    pub file_name: &'a str,
    pub file_size: i64,
    pub mime_type: &'a str,
    pub width: i64,
    pub height: i64,
    pub modified_at: Option<i64>,
    pub created_at: &'a str,
}

impl AssetRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn begin(&self) -> Result<Transaction<'_, Sqlite>> {
        Ok(self.pool.begin().await?)
    }

    pub async fn count_all(&self) -> Result<i64> {
        let row =
            sqlx::query!(r#"SELECT COUNT(*) AS "count!: i64" FROM asset"#)
                .fetch_one(&self.pool)
                .await?;
        Ok(row.count)
    }

    pub async fn count_uncategorized(&self) -> Result<i64> {
        let row = sqlx::query!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM asset
            WHERE id NOT IN (SELECT asset_id FROM asset_virtual_folder)
            "#,
        )
        .fetch_one(&self.pool)
        .await?;
        Ok(row.count)
    }

    pub async fn list(
        &self,
        source: AssetListSource,
    ) -> Result<Vec<AssetSummary>> {
        let rows = match source {
            AssetListSource::AllAssets => {
                sqlx::query_as!(
                    AssetRow,
                    r#"
                    SELECT id,
                           hash,
                           file_name,
                           file_size,
                           mime_type,
                           width,
                           height,
                           modified_at,
                           created_at,
                           updated_at
                    FROM asset
                    ORDER BY updated_at DESC, created_at DESC
                    "#,
                )
                .fetch_all(&self.pool)
                .await?
            }
            AssetListSource::Uncategorized => {
                sqlx::query_as!(
                    AssetRow,
                    r#"
                    SELECT id,
                           hash,
                           file_name,
                           file_size,
                           mime_type,
                           width,
                           height,
                           modified_at,
                           created_at,
                           updated_at
                    FROM asset
                    WHERE id NOT IN (SELECT asset_id FROM asset_virtual_folder)
                    ORDER BY updated_at DESC, created_at DESC
                    "#,
                )
                .fetch_all(&self.pool)
                .await?
            }
            AssetListSource::Folder { folder_id } => {
                sqlx::query_as!(
                    AssetRow,
                    r#"
                    SELECT a.id,
                           a.hash,
                           a.file_name,
                           a.file_size,
                           a.mime_type,
                           a.width,
                           a.height,
                           a.modified_at,
                           a.created_at,
                           a.updated_at
                    FROM asset a
                    INNER JOIN asset_virtual_folder avf ON avf.asset_id = a.id
                    WHERE avf.virtual_folder_id = ?1
                    ORDER BY a.updated_at DESC, a.created_at DESC
                    "#,
                    folder_id
                )
                .fetch_all(&self.pool)
                .await?
            }
        };

        Ok(rows.into_iter().map(asset_from_row).collect())
    }

    pub async fn get_summary(&self, asset_id: &str) -> Result<AssetSummary> {
        let row = sqlx::query_as!(
            AssetRow,
            r#"
            SELECT id,
                   hash,
                   file_name,
                   file_size,
                   mime_type,
                   width,
                   height,
                   modified_at,
                   created_at,
                   updated_at
            FROM asset
            WHERE id = ?1
            "#,
            asset_id
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(asset_from_row(row))
    }

    pub async fn get_detail(&self, asset_id: &str) -> Result<AssetDetail> {
        let asset = self.get_summary(asset_id).await?;

        let folder_rows = sqlx::query_as!(
            VirtualFolderRow,
            r#"
            SELECT vf.id,
                   vf.parent_id,
                   vf.name,
                   vf.full_path,
                   vf.alias,
                   vf.sort_order,
                   vf.created_at,
                   vf.updated_at
            FROM virtual_folder vf
            INNER JOIN asset_virtual_folder avf ON avf.virtual_folder_id = vf.id
            WHERE avf.asset_id = ?1
            ORDER BY vf.full_path ASC
            "#,
            asset_id
        )
        .fetch_all(&self.pool)
        .await?;

        let tag_rows = sqlx::query_as!(
            TagRow,
            r#"
            SELECT t.id,
                   t.group_id,
                   t.name,
                   t.color,
                   t.sort_order,
                   t.created_at,
                   t.updated_at
            FROM tag t
            INNER JOIN asset_tag at ON at.tag_id = t.id
            WHERE at.asset_id = ?1
            ORDER BY t.name ASC
            "#,
            asset_id
        )
        .fetch_all(&self.pool)
        .await?;

        let record_rows = sqlx::query_as!(
            CroquisRecordSummaryRow,
            r#"
            SELECT id,
                   title,
                   source_asset_id,
                   result_asset_id,
                   session_id,
                   step_index,
                   step_name,
                   target_duration_seconds,
                   started_at,
                   finished_at,
                   finalized_at,
                   created_at,
                   updated_at
            FROM croquis_record
            WHERE source_asset_id = ?1 OR result_asset_id = ?1
            ORDER BY created_at DESC
            LIMIT 24
            "#,
            asset_id
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(AssetDetail {
            asset,
            virtual_folders: folder_rows
                .into_iter()
                .map(folder_from_row)
                .collect::<Vec<VirtualFolder>>(),
            tags: tag_rows.into_iter().map(tag_from_row).collect::<Vec<Tag>>(),
            related_records: record_rows
                .into_iter()
                .map(record_summary_from_row)
                .collect::<Vec<CroquisRecordSummary>>(),
        })
    }

    pub async fn load_by_hash(
        &self,
        hash: &str,
    ) -> Result<Option<AssetSummary>> {
        let row = sqlx::query_as!(
            AssetRow,
            r#"
            SELECT id,
                   hash,
                   file_name,
                   file_size,
                   mime_type,
                   width,
                   height,
                   modified_at,
                   created_at,
                   updated_at
            FROM asset
            WHERE hash = ?1
            "#,
            hash
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(asset_from_row))
    }

    pub async fn load_many_summaries(
        &self,
        asset_ids: &[String],
    ) -> Result<Vec<AssetSummary>> {
        let mut assets = Vec::with_capacity(asset_ids.len());
        for asset_id in asset_ids {
            assets.push(self.get_summary(asset_id).await?);
        }
        Ok(assets)
    }

    pub async fn insert_imported_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        input: &NewImportedAssetInput<'_>,
    ) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO asset
            (id, hash, file_name, file_size, mime_type, width, height,
             modified_at, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
            "#,
            input.id,
            input.hash,
            input.file_name,
            input.file_size,
            input.mime_type,
            input.width,
            input.height,
            input.modified_at,
            input.created_at
        )
        .execute(&mut **tx)
        .await?;

        Ok(())
    }

    pub async fn assign_folders_and_tags_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        asset_id: &str,
        virtual_folder_ids: &[String],
        tag_ids: &[String],
    ) -> Result<()> {
        for folder_id in virtual_folder_ids {
            let created_at = get_now_date();
            let created_at_ref = created_at.as_str();
            sqlx::query!(
                r#"
                INSERT OR IGNORE INTO asset_virtual_folder
                (asset_id, virtual_folder_id, source_type, created_at)
                VALUES (?1, ?2, 'manual', ?3)
                "#,
                asset_id,
                folder_id,
                created_at_ref
            )
            .execute(&mut **tx)
            .await?;
        }

        for tag_id in tag_ids {
            let created_at = get_now_date();
            let created_at_ref = created_at.as_str();
            sqlx::query!(
                r#"
                INSERT OR IGNORE INTO asset_tag
                (asset_id, tag_id, created_at)
                VALUES (?1, ?2, ?3)
                "#,
                asset_id,
                tag_id,
                created_at_ref
            )
            .execute(&mut **tx)
            .await?;
        }

        Ok(())
    }

    pub async fn replace_folders_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        asset_id: &str,
        virtual_folder_ids: &[String],
    ) -> Result<()> {
        sqlx::query!(
            "DELETE FROM asset_virtual_folder WHERE asset_id = ?1",
            asset_id
        )
        .execute(&mut **tx)
        .await?;
        self.assign_folders_and_tags_in_tx(
            tx,
            asset_id,
            virtual_folder_ids,
            &[],
        )
        .await
    }

    pub async fn replace_tags_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        asset_id: &str,
        tag_ids: &[String],
    ) -> Result<()> {
        let now = get_now_date();
        let now_ref = now.as_str();
        sqlx::query!("DELETE FROM asset_tag WHERE asset_id = ?1", asset_id)
            .execute(&mut **tx)
            .await?;

        for tag_id in tag_ids {
            sqlx::query!(
                "INSERT OR IGNORE INTO asset_tag (asset_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
                asset_id,
                tag_id,
                now_ref
            )
            .execute(&mut **tx)
            .await?;
        }

        Ok(())
    }
}

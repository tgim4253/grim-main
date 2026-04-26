use anyhow::Result;
use sqlx::SqlitePool;

use crate::{
    models::{
        record::{
            CroquisRecordDetail, CroquisRecordSummary,
            DeleteCroquisRecordPayload, FinishCroquisRecordPayload,
            SaveCroquisRecordPayload, UpdateCroquisRecordTagsPayload,
        },
        tag::Tag,
    },
    utils::{date::get_now_date, identifier::get_unique_id},
};

use super::mappers::{
    record_detail_row_into_summary, record_summary_from_row, tag_from_row,
    CroquisRecordDetailRow, CroquisRecordSummaryRow, TagRow,
};

#[derive(Clone)]
pub struct RecordRepository {
    pool: SqlitePool,
}

impl RecordRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list_recent(
        &self,
        limit: i64,
    ) -> Result<Vec<CroquisRecordSummary>> {
        let rows = sqlx::query_as!(
            CroquisRecordSummaryRow,
            r#"
            SELECT id,
                   title,
                   source_asset_id,
                   result_asset_id,
                   target_duration_seconds,
                   actual_duration_seconds,
                   finished_at,
                   created_at,
                   updated_at
            FROM croquis_record
            WHERE finished_at IS NOT NULL
            ORDER BY finished_at DESC, created_at DESC
            LIMIT ?1
            "#,
            limit
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(record_summary_from_row).collect())
    }

    pub async fn finish(
        &self,
        payload: FinishCroquisRecordPayload,
    ) -> Result<String> {
        let now = get_now_date();
        let now_ref = now.as_str();
        let record_id = get_unique_id();
        let record_id_ref = record_id.as_str();
        let source_asset_id = payload.source_asset_id.as_str();
        let title = payload.title.as_str();
        let finished_at = payload.finished_at.as_str();

        let mut tx = self.pool.begin().await?;
        sqlx::query!(
            r#"
            INSERT INTO croquis_record
            (id, source_asset_id, title, target_duration_seconds, actual_duration_seconds, finished_at, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            "#,
            record_id_ref,
            source_asset_id,
            title,
            payload.target_duration_seconds,
            payload.actual_duration_seconds,
            finished_at,
            now_ref
        )
        .execute(&mut *tx)
        .await?;

        for tag_id in &payload.tag_ids {
            sqlx::query!(
                "INSERT OR IGNORE INTO croquis_record_tag (record_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
                record_id_ref,
                tag_id,
                now_ref
            )
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(record_id)
    }

    pub async fn get_detail(
        &self,
        record_id: &str,
    ) -> Result<CroquisRecordDetail> {
        let row = sqlx::query_as!(
            CroquisRecordDetailRow,
            r#"
            SELECT id,
                   title,
                   note,
                   source_asset_id,
                   result_asset_id,
                   target_duration_seconds,
                   actual_duration_seconds,
                   finished_at,
                   created_at,
                   updated_at
            FROM croquis_record
            WHERE id = ?1
            "#,
            record_id
        )
        .fetch_one(&self.pool)
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
            INNER JOIN croquis_record_tag crt ON crt.tag_id = t.id
            WHERE crt.record_id = ?1
            ORDER BY t.name ASC
            "#,
            record_id
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(CroquisRecordDetail {
            record: record_detail_row_into_summary(&row),
            note: row.note,
            source_asset: None,
            result_asset: None,
            tags: tag_rows.into_iter().map(tag_from_row).collect::<Vec<Tag>>(),
        })
    }

    pub async fn save(
        &self,
        payload: SaveCroquisRecordPayload,
    ) -> Result<String> {
        let now = get_now_date();
        let now_ref = now.as_str();
        let record_id = payload.id.clone().unwrap_or_else(get_unique_id);
        let record_id_ref = record_id.as_str();
        let title = payload
            .title
            .clone()
            .unwrap_or_else(|| "Croquis Record".to_string());
        let title_ref = title.as_str();
        let source_asset_id = payload.source_asset_id.as_deref();
        let result_asset_id = payload.result_asset_id.as_deref();
        let note = payload.note.as_deref();

        let mut tx = self.pool.begin().await?;
        if payload.id.is_some() {
            sqlx::query!(
                r#"
                UPDATE croquis_record
                SET source_asset_id = ?2,
                    result_asset_id = ?3,
                    title = ?4,
                    note = COALESCE(?5, note),
                    target_duration_seconds = ?6,
                    updated_at = ?7
                WHERE id = ?1
                "#,
                record_id_ref,
                source_asset_id,
                result_asset_id,
                title_ref,
                note,
                payload.target_duration_seconds,
                now_ref
            )
            .execute(&mut *tx)
            .await?;
        } else {
            sqlx::query!(
                r#"
                INSERT INTO croquis_record
                (id, source_asset_id, result_asset_id, title, note, target_duration_seconds, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, COALESCE(?5, ''), ?6, ?7, ?7)
                "#,
                record_id_ref,
                source_asset_id,
                result_asset_id,
                title_ref,
                note,
                payload.target_duration_seconds,
                now_ref
            )
            .execute(&mut *tx)
            .await?;
        }

        sqlx::query!(
            "DELETE FROM croquis_record_tag WHERE record_id = ?1",
            record_id_ref
        )
        .execute(&mut *tx)
        .await?;

        for tag_id in &payload.tag_ids {
            sqlx::query!(
                "INSERT OR IGNORE INTO croquis_record_tag (record_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
                record_id_ref,
                tag_id,
                now_ref
            )
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(record_id)
    }

    pub async fn delete(
        &self,
        payload: DeleteCroquisRecordPayload,
    ) -> Result<()> {
        let record_id = payload.record_id.as_str();
        sqlx::query!("DELETE FROM croquis_record WHERE id = ?1", record_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_tags(
        &self,
        payload: UpdateCroquisRecordTagsPayload,
    ) -> Result<()> {
        let now = get_now_date();
        let now_ref = now.as_str();
        let record_id = payload.record_id.as_str();
        let mut tx = self.pool.begin().await?;
        sqlx::query!(
            "DELETE FROM croquis_record_tag WHERE record_id = ?1",
            record_id
        )
        .execute(&mut *tx)
        .await?;

        for tag_id in &payload.tag_ids {
            sqlx::query!(
                "INSERT OR IGNORE INTO croquis_record_tag (record_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
                record_id,
                tag_id,
                now_ref
            )
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    pub async fn attach_result_asset(
        &self,
        record_id: &str,
        result_asset_id: &str,
        actual_duration_seconds: Option<f64>,
    ) -> Result<()> {
        let now = get_now_date();
        let now_ref = now.as_str();
        sqlx::query!(
            r#"
            UPDATE croquis_record
            SET result_asset_id = ?2,
                actual_duration_seconds = COALESCE(?3, actual_duration_seconds),
                updated_at = ?4
            WHERE id = ?1
            "#,
            record_id,
            result_asset_id,
            actual_duration_seconds,
            now_ref
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

use anyhow::Result;
use sqlx::SqlitePool;

use crate::{
    models::{
        record::{
            CroquisRecordDetail, CroquisRecordSummary,
            DeleteCroquisRecordPayload, FinalizeCroquisRecordPayload,
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
            ORDER BY created_at DESC
            LIMIT ?1
            "#,
            limit
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(record_summary_from_row).collect())
    }

    pub async fn list_by_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<CroquisRecordSummary>> {
        let rows = sqlx::query_as!(
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
            WHERE session_id = ?1
            ORDER BY COALESCE(step_index, 999999) ASC, created_at ASC
            "#,
            session_id
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(record_summary_from_row).collect())
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
        let title = payload.title.clone().unwrap_or_else(|| {
            payload
                .step_name
                .clone()
                .unwrap_or_else(|| "Croquis Record".to_string())
        });
        let title_ref = title.as_str();
        let source_asset_id = payload.source_asset_id.as_deref();
        let result_asset_id = payload.result_asset_id.as_deref();
        let session_id = payload.session_id.as_deref();
        let step_name = payload.step_name.as_deref();
        let note = payload.note.as_deref();

        let mut tx = self.pool.begin().await?;
        if payload.id.is_some() {
            sqlx::query!(
                r#"
                UPDATE croquis_record
                SET source_asset_id = ?2,
                    result_asset_id = ?3,
                    session_id = ?4,
                    step_index = ?5,
                    step_name = ?6,
                    title = ?7,
                    note = COALESCE(?8, note),
                    target_duration_seconds = ?9,
                    updated_at = ?10
                WHERE id = ?1
                "#,
                record_id_ref,
                source_asset_id,
                result_asset_id,
                session_id,
                payload.step_index,
                step_name,
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
                (id, source_asset_id, result_asset_id, session_id, step_index, step_name, title, note,
                 target_duration_seconds, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, COALESCE(?8, ''), ?9, ?10, ?10)
                "#,
                record_id_ref,
                source_asset_id,
                result_asset_id,
                session_id,
                payload.step_index,
                step_name,
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

    pub async fn delete_by_session(&self, session_id: &str) -> Result<()> {
        sqlx::query!(
            "DELETE FROM croquis_record WHERE session_id = ?1",
            session_id
        )
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

    pub async fn mark_started(&self, record_id: &str) -> Result<()> {
        let now = get_now_date();
        let now_ref = now.as_str();
        sqlx::query!(
            r#"
            UPDATE croquis_record
            SET started_at = COALESCE(started_at, ?2),
                updated_at = ?2
            WHERE id = ?1
            "#,
            record_id,
            now_ref
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn finalize(
        &self,
        payload: FinalizeCroquisRecordPayload,
    ) -> Result<()> {
        let now = get_now_date();
        let now_ref = now.as_str();
        let finished_at = payload.finished_at.unwrap_or_else(|| now.clone());
        let finalized_at = payload.finalized_at.unwrap_or_else(|| now.clone());
        let record_id = payload.record_id.as_str();
        let finished_at_ref = finished_at.as_str();
        let finalized_at_ref = finalized_at.as_str();
        let finished_at_value = Some(finished_at_ref);
        let finalized_at_value = Some(finalized_at_ref);
        let title_suffix = payload
            .actual_duration_seconds
            .map(|value| format!(" ({value:.1}s)"));

        sqlx::query!(
            r#"
            UPDATE croquis_record
            SET finished_at = COALESCE(?2, finished_at),
                finalized_at = COALESCE(?3, finalized_at),
                updated_at = ?4
            WHERE id = ?1
            "#,
            record_id,
            finished_at_value,
            finalized_at_value,
            now_ref
        )
        .execute(&self.pool)
        .await?;

        if let Some(suffix) = title_suffix {
            let title_pattern = format!("%{suffix}");
            let suffix_ref = suffix.as_str();
            let title_pattern_ref = title_pattern.as_str();
            sqlx::query!(
                "UPDATE croquis_record SET title = TRIM(title || ?2), updated_at = ?3 WHERE id = ?1 AND title NOT LIKE ?4",
                record_id,
                suffix_ref,
                now_ref,
                title_pattern_ref
            )
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    pub async fn attach_result_asset(
        &self,
        record_id: &str,
        result_asset_id: &str,
    ) -> Result<()> {
        let now = get_now_date();
        let now_ref = now.as_str();
        sqlx::query!(
            r#"
            UPDATE croquis_record
            SET result_asset_id = ?2,
                finished_at = COALESCE(finished_at, ?3),
                finalized_at = ?3,
                updated_at = ?3
            WHERE id = ?1
            "#,
            record_id,
            result_asset_id,
            now_ref
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

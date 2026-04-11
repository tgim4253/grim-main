use std::collections::HashMap;

use anyhow::Result;
use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::models::{
    session::{SessionPreset, SessionStepPreset, SessionSummary},
    tag::Tag,
};

use super::mappers::{
    session_summary_from_row, SessionPresetRow, SessionStepPresetJoinRow,
    SessionSummaryRow,
};

#[derive(Clone)]
pub struct SessionRepository {
    pool: SqlitePool,
}

pub struct SaveSessionPresetStepInput<'a> {
    pub id: &'a str,
    pub preset_id: &'a str,
    pub step_order: i64,
    pub name: &'a str,
    pub default_duration_seconds: Option<i64>,
    pub result_required: bool,
}

pub struct UpsertSessionPresetInput<'a> {
    pub id: &'a str,
    pub name: &'a str,
    pub description: Option<&'a str>,
    pub is_default: bool,
    pub timestamp: &'a str,
    pub is_update: bool,
}

pub struct NewSessionInput<'a> {
    pub id: &'a str,
    pub title: &'a str,
    pub preset_id: Option<&'a str>,
    pub started_at: &'a str,
}

impl SessionRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn begin(&self) -> Result<Transaction<'_, Sqlite>> {
        Ok(self.pool.begin().await?)
    }

    pub async fn list_recent(&self, limit: i64) -> Result<Vec<SessionSummary>> {
        let rows = sqlx::query_as!(
            SessionSummaryRow,
            r#"
            SELECT s.id,
                   s.title,
                   s.preset_id,
                   s.started_at,
                   s.finished_at,
                   s.created_at,
                   s.updated_at,
                   (
                       SELECT COUNT(*)
                       FROM croquis_record r
                       WHERE r.session_id = s.id
                   ) AS "record_count!: i64",
                   (
                       SELECT r.id
                       FROM croquis_record r
                       WHERE r.session_id = s.id
                       ORDER BY COALESCE(r.step_index, 999999) ASC, r.created_at ASC, r.id ASC
                       LIMIT 1
                   ) AS first_record_id
            FROM session s
            ORDER BY s.created_at DESC
            LIMIT ?1
            "#,
            limit
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(session_summary_from_row).collect())
    }

    pub async fn get_summary(
        &self,
        session_id: &str,
    ) -> Result<SessionSummary> {
        let row = sqlx::query_as!(
            SessionSummaryRow,
            r#"
            SELECT s.id,
                   s.title,
                   s.preset_id,
                   s.started_at,
                   s.finished_at,
                   s.created_at,
                   s.updated_at,
                   (
                       SELECT COUNT(*)
                       FROM croquis_record r
                       WHERE r.session_id = s.id
                   ) AS "record_count!: i64",
                   (
                       SELECT r.id
                       FROM croquis_record r
                       WHERE r.session_id = s.id
                       ORDER BY COALESCE(r.step_index, 999999) ASC, r.created_at ASC, r.id ASC
                       LIMIT 1
                   ) AS first_record_id
            FROM session s
            WHERE s.id = ?1
            "#,
            session_id
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(session_summary_from_row(row))
    }

    pub async fn list_presets(&self) -> Result<Vec<SessionPreset>> {
        let preset_rows = sqlx::query_as!(
            SessionPresetRow,
            r#"
            SELECT id,
                   name,
                   description,
                   is_default AS "is_default: bool",
                   created_at,
                   updated_at
            FROM session_preset
            ORDER BY is_default DESC, created_at ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let step_rows = sqlx::query_as!(
            SessionStepPresetJoinRow,
            r#"
            SELECT ssp.id,
                   ssp.preset_id,
                   ssp.step_order,
                   ssp.name,
                   ssp.default_duration_seconds,
                   ssp.result_required AS "result_required: bool",
                   t.id AS tag_id,
                   t.group_id,
                   t.name AS tag_name,
                   t.color,
                   t.sort_order,
                   t.created_at AS tag_created_at,
                   t.updated_at AS tag_updated_at
            FROM session_step_preset ssp
            LEFT JOIN session_step_preset_tag sspt ON sspt.step_preset_id = ssp.id
            LEFT JOIN tag t ON t.id = sspt.tag_id
            ORDER BY ssp.preset_id ASC, ssp.step_order ASC, t.name ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut steps_by_preset: HashMap<String, Vec<SessionStepPreset>> =
            HashMap::new();
        let mut step_index: HashMap<String, (String, usize)> = HashMap::new();

        for row in step_rows {
            let step_id = row.id.clone();
            let preset_id = row.preset_id.clone();

            let entry = steps_by_preset.entry(preset_id.clone()).or_default();
            if let Some((existing_preset_id, index)) = step_index.get(&step_id)
            {
                if existing_preset_id == &preset_id {
                    if let Some(tag_id) = row.tag_id.clone() {
                        entry[*index].auto_tags.push(Tag {
                            id: tag_id,
                            group_id: row.group_id.clone(),
                            name: row.tag_name.clone().unwrap_or_default(),
                            color: row.color.clone(),
                            sort_order: row.sort_order.unwrap_or_default(),
                            created_at: row
                                .tag_created_at
                                .clone()
                                .unwrap_or_default(),
                            updated_at: row
                                .tag_updated_at
                                .clone()
                                .unwrap_or_default(),
                        });
                    }
                    continue;
                }
            }

            let mut step = SessionStepPreset {
                id: step_id.clone(),
                step_order: row.step_order,
                name: row.name.clone(),
                default_duration_seconds: row.default_duration_seconds,
                auto_tags: Vec::new(),
                result_required: row.result_required,
            };

            if let Some(tag_id) = row.tag_id.clone() {
                step.auto_tags.push(Tag {
                    id: tag_id,
                    group_id: row.group_id.clone(),
                    name: row.tag_name.clone().unwrap_or_default(),
                    color: row.color.clone(),
                    sort_order: row.sort_order.unwrap_or_default(),
                    created_at: row.tag_created_at.clone().unwrap_or_default(),
                    updated_at: row.tag_updated_at.clone().unwrap_or_default(),
                });
            }

            step_index.insert(step_id, (preset_id.clone(), entry.len()));
            entry.push(step);
        }

        let presets = preset_rows
            .into_iter()
            .map(|row| SessionPreset {
                id: row.id.clone(),
                name: row.name,
                description: row.description,
                is_default: row.is_default,
                steps: steps_by_preset.remove(&row.id).unwrap_or_default(),
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect::<Vec<SessionPreset>>();

        Ok(presets)
    }

    pub async fn clear_default_flags_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        updated_at: &str,
    ) -> Result<()> {
        sqlx::query!(
            "UPDATE session_preset SET is_default = 0, updated_at = ?1",
            updated_at
        )
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    pub async fn upsert_preset_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        input: &UpsertSessionPresetInput<'_>,
    ) -> Result<()> {
        let is_default = if input.is_default { 1_i64 } else { 0_i64 };
        if input.is_update {
            sqlx::query!(
                r#"
                UPDATE session_preset
                SET name = ?2, description = ?3, is_default = ?4, updated_at = ?5
                WHERE id = ?1
                "#,
                input.id,
                input.name,
                input.description,
                is_default,
                input.timestamp
            )
            .execute(&mut **tx)
            .await?;
        } else {
            sqlx::query!(
                r#"
                INSERT INTO session_preset
                (id, name, description, is_default, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?5)
                "#,
                input.id,
                input.name,
                input.description,
                is_default,
                input.timestamp
            )
            .execute(&mut **tx)
            .await?;
        }

        Ok(())
    }

    pub async fn delete_preset_steps_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        preset_id: &str,
    ) -> Result<()> {
        sqlx::query!(
            "DELETE FROM session_step_preset_tag WHERE step_preset_id IN (SELECT id FROM session_step_preset WHERE preset_id = ?1)",
            preset_id
        )
        .execute(&mut **tx)
        .await?;
        sqlx::query!(
            "DELETE FROM session_step_preset WHERE preset_id = ?1",
            preset_id
        )
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    pub async fn insert_step_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        input: &SaveSessionPresetStepInput<'_>,
        created_at: &str,
    ) -> Result<()> {
        let result_required = if input.result_required { 1_i64 } else { 0_i64 };
        sqlx::query!(
            r#"
            INSERT INTO session_step_preset
            (id, preset_id, step_order, name, default_duration_seconds, result_required, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            "#,
            input.id,
            input.preset_id,
            input.step_order,
            input.name,
            input.default_duration_seconds,
            result_required,
            created_at
        )
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    pub async fn link_step_tags_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        step_preset_id: &str,
        tag_ids: &[String],
        created_at: &str,
    ) -> Result<()> {
        for tag_id in tag_ids {
            sqlx::query!(
                "INSERT OR IGNORE INTO session_step_preset_tag (step_preset_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
                step_preset_id,
                tag_id,
                created_at
            )
            .execute(&mut **tx)
            .await?;
        }
        Ok(())
    }

    pub async fn delete_preset_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        preset_id: &str,
    ) -> Result<()> {
        sqlx::query!("DELETE FROM session_preset WHERE id = ?1", preset_id)
            .execute(&mut **tx)
            .await?;
        Ok(())
    }

    pub async fn find_default_id_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
    ) -> Result<Option<String>> {
        Ok(sqlx::query_scalar!(
            "SELECT id FROM session_preset WHERE is_default = 1 LIMIT 1"
        )
        .fetch_optional(&mut **tx)
        .await?)
    }

    pub async fn find_first_id_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
    ) -> Result<Option<String>> {
        Ok(sqlx::query_scalar!(
            "SELECT id FROM session_preset ORDER BY created_at ASC LIMIT 1"
        )
        .fetch_optional(&mut **tx)
        .await?)
    }

    pub async fn set_default_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        preset_id: &str,
        updated_at: &str,
    ) -> Result<()> {
        sqlx::query!(
            "UPDATE session_preset SET is_default = 1, updated_at = ?2 WHERE id = ?1",
            preset_id,
            updated_at
        )
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    pub async fn delete(&self, session_id: &str) -> Result<()> {
        sqlx::query!("DELETE FROM session WHERE id = ?1", session_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn create_session(
        &self,
        input: &NewSessionInput<'_>,
    ) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO session
            (id, preset_id, title, started_at, finished_at, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, NULL, ?4, ?4)
            "#,
            input.id,
            input.preset_id,
            input.title,
            input.started_at
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

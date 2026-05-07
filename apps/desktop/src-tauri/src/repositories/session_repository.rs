use std::collections::HashMap;

use anyhow::{bail, Result};
use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::models::{
    session::{SessionPreset, SessionStepPreset, TimeStepPreset},
    tag::Tag,
};

use super::mappers::{
    SessionPresetRow, SessionPresetTagJoinRow, SessionStepPresetJoinRow,
    TimeStepPresetJoinRow,
};

#[derive(Clone)]
pub struct SessionRepository {
    pool: SqlitePool,
}

pub struct SaveSessionPresetStepInput<'a> {
    pub id: &'a str,
    pub preset_id: &'a str,
    pub time_step_preset_id: &'a str,
    pub step_order: i64,
}

pub struct UpsertSessionPresetInput<'a> {
    pub id: &'a str,
    pub name: &'a str,
    pub description: Option<&'a str>,
    pub is_default: bool,
    pub window_width: Option<&'a str>,
    pub window_height: Option<&'a str>,
    pub is_shuffle: bool,
    pub timestamp: &'a str,
    pub is_update: bool,
}

pub struct UpsertTimeStepPresetInput<'a> {
    pub id: &'a str,
    pub name: &'a str,
    pub default_duration_seconds: Option<i64>,
    pub auto_advance: bool,
    pub record_save_enabled: bool,
    pub capture_enabled: bool,
    pub grayscale_enabled: bool,
    pub result_required: bool,
    pub result_save_path: Option<&'a str>,
    pub timestamp: &'a str,
    pub is_update: bool,
}

impl SessionRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn begin(&self) -> Result<Transaction<'_, Sqlite>> {
        Ok(self.pool.begin().await?)
    }

    pub async fn list_presets(&self) -> Result<Vec<SessionPreset>> {
        let preset_rows = sqlx::query_as!(
            SessionPresetRow,
            r#"
            SELECT id,
                   name,
                   description,
                   is_default AS "is_default: bool",
                   window_width,
                   window_height,
                   is_shuffle AS "is_shuffle: bool",
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
                   ssp.time_step_preset_id AS "time_step_preset_id!: String",
                   ssp.step_order,
                   tsp.name,
                   tsp.default_duration_seconds,
                   tsp.auto_advance AS "auto_advance: bool",
                   tsp.record_save_enabled AS "record_save_enabled: bool",
                   tsp.capture_enabled AS "capture_enabled: bool",
                   tsp.grayscale_enabled AS "grayscale_enabled: bool",
                   tsp.result_required AS "result_required: bool",
                   tsp.result_save_path,
                   tsp.created_at AS time_step_created_at,
                   tsp.updated_at AS time_step_updated_at,
                   t.id AS tag_id,
                   t.group_id,
                   t.name AS tag_name,
                   t.color,
                   t.sort_order,
                   t.created_at AS tag_created_at,
                   t.updated_at AS tag_updated_at
            FROM session_step_preset ssp
            INNER JOIN time_step_preset tsp ON tsp.id = ssp.time_step_preset_id
            LEFT JOIN time_step_preset_tag tspt ON tspt.time_step_preset_id = tsp.id
            LEFT JOIN tag t ON t.id = tspt.tag_id
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
                    if let Some(tag) = tag_from_join_row(&row) {
                        entry[*index].time_step.auto_tags.push(tag);
                    }
                    continue;
                }
            }

            let mut time_step = TimeStepPreset {
                id: row.time_step_preset_id.clone(),
                name: row.name.clone(),
                default_duration_seconds: row.default_duration_seconds,
                auto_advance: row.auto_advance,
                record_save_enabled: row.record_save_enabled,
                capture_enabled: row.capture_enabled,
                grayscale_enabled: row.grayscale_enabled,
                result_required: row.result_required,
                result_save_path: row.result_save_path.clone(),
                auto_tags: Vec::new(),
                created_at: row.time_step_created_at.clone(),
                updated_at: row.time_step_updated_at.clone(),
            };

            if let Some(tag) = tag_from_join_row(&row) {
                time_step.auto_tags.push(tag);
            }

            step_index
                .insert(step_id.clone(), (preset_id.clone(), entry.len()));
            entry.push(SessionStepPreset {
                id: step_id,
                time_step_preset_id: row.time_step_preset_id,
                step_order: row.step_order,
                time_step,
            });
        }

        let session_tag_rows = sqlx::query_as!(
            SessionPresetTagJoinRow,
            r#"
            SELECT spt.session_preset_id AS "preset_id!: String",
                   t.id AS "tag_id!: String",
                   t.group_id,
                   t.name AS "tag_name!: String",
                   t.color,
                   t.sort_order AS "sort_order!: i64",
                   t.created_at AS "tag_created_at!: String",
                   t.updated_at AS "tag_updated_at!: String"
            FROM session_preset_tag spt
            INNER JOIN tag t ON t.id = spt.tag_id
            ORDER BY spt.session_preset_id ASC, t.name ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;
        let mut tags_by_preset: HashMap<String, Vec<Tag>> = HashMap::new();

        for row in session_tag_rows {
            tags_by_preset.entry(row.preset_id.clone()).or_default().push(
                Tag {
                    id: row.tag_id,
                    group_id: row.group_id,
                    name: row.tag_name,
                    color: row.color,
                    sort_order: row.sort_order,
                    created_at: row.tag_created_at,
                    updated_at: row.tag_updated_at,
                },
            );
        }

        let presets = preset_rows
            .into_iter()
            .map(|row| SessionPreset {
                id: row.id.clone(),
                name: row.name,
                description: row.description,
                is_default: row.is_default,
                window_width: row.window_width,
                window_height: row.window_height,
                is_shuffle: row.is_shuffle,
                auto_tags: tags_by_preset.remove(&row.id).unwrap_or_default(),
                steps: steps_by_preset.remove(&row.id).unwrap_or_default(),
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect::<Vec<SessionPreset>>();
        Ok(presets)
    }

    pub async fn list_time_step_presets(&self) -> Result<Vec<TimeStepPreset>> {
        let rows = sqlx::query_as!(
            TimeStepPresetJoinRow,
            r#"
            SELECT tsp.id,
                   tsp.name,
                   tsp.default_duration_seconds,
                   tsp.auto_advance AS "auto_advance: bool",
                   tsp.record_save_enabled AS "record_save_enabled: bool",
                   tsp.capture_enabled AS "capture_enabled: bool",
                   tsp.grayscale_enabled AS "grayscale_enabled: bool",
                   tsp.result_required AS "result_required: bool",
                   tsp.result_save_path,
                   tsp.created_at,
                   tsp.updated_at,
                   t.id AS tag_id,
                   t.group_id,
                   t.name AS tag_name,
                   t.color,
                   t.sort_order,
                   t.created_at AS tag_created_at,
                   t.updated_at AS tag_updated_at
            FROM time_step_preset tsp
            LEFT JOIN time_step_preset_tag tspt ON tspt.time_step_preset_id = tsp.id
            LEFT JOIN tag t ON t.id = tspt.tag_id
            ORDER BY tsp.created_at ASC, t.name ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut presets = Vec::<TimeStepPreset>::new();
        let mut preset_index = HashMap::<String, usize>::new();

        for row in rows {
            let preset_id = row.id.clone();
            let index = if let Some(index) = preset_index.get(&preset_id) {
                *index
            } else {
                let index = presets.len();
                preset_index.insert(preset_id.clone(), index);
                presets.push(TimeStepPreset {
                    id: preset_id.clone(),
                    name: row.name.clone(),
                    default_duration_seconds: row.default_duration_seconds,
                    auto_advance: row.auto_advance,
                    record_save_enabled: row.record_save_enabled,
                    capture_enabled: row.capture_enabled,
                    grayscale_enabled: row.grayscale_enabled,
                    result_required: row.result_required,
                    result_save_path: row.result_save_path.clone(),
                    auto_tags: Vec::new(),
                    created_at: row.created_at.clone(),
                    updated_at: row.updated_at.clone(),
                });
                index
            };

            if let Some(tag_id) = row.tag_id.clone() {
                presets[index].auto_tags.push(Tag {
                    id: tag_id,
                    group_id: row.group_id.clone(),
                    name: row.tag_name.clone().unwrap_or_default(),
                    color: row.color.clone(),
                    sort_order: row.sort_order.unwrap_or_default(),
                    created_at: row.tag_created_at.clone().unwrap_or_default(),
                    updated_at: row.tag_updated_at.clone().unwrap_or_default(),
                });
            }
        }

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
        let is_shuffle = if input.is_shuffle { 1_i64 } else { 0_i64 };
        if input.is_update {
            let result = sqlx::query!(
                r#"
                UPDATE session_preset
                SET name = ?2,
                    description = ?3,
                    is_default = ?4,
                    window_width = ?5,
                    window_height = ?6,
                    is_shuffle = ?7,
                    updated_at = ?8
                WHERE id = ?1
                "#,
                input.id,
                input.name,
                input.description,
                is_default,
                input.window_width,
                input.window_height,
                is_shuffle,
                input.timestamp
            )
            .execute(&mut **tx)
            .await?;

            if result.rows_affected() == 0 {
                bail!("Session preset not found");
            }
        } else {
            sqlx::query!(
                r#"
                INSERT INTO session_preset
                (id, name, description, is_default, window_width, window_height, is_shuffle, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
                "#,
                input.id,
                input.name,
                input.description,
                is_default,
                input.window_width,
                input.window_height,
                is_shuffle,
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
        sqlx::query!(
            r#"
            INSERT INTO session_step_preset
            (id, preset_id, time_step_preset_id, step_order, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?5)
            "#,
            input.id,
            input.preset_id,
            input.time_step_preset_id,
            input.step_order,
            created_at
        )
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    pub async fn upsert_time_step_preset_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        input: &UpsertTimeStepPresetInput<'_>,
    ) -> Result<()> {
        let auto_advance = if input.auto_advance { 1_i64 } else { 0_i64 };
        let record_save_enabled =
            if input.record_save_enabled { 1_i64 } else { 0_i64 };
        let capture_enabled = if input.capture_enabled { 1_i64 } else { 0_i64 };
        let grayscale_enabled =
            if input.grayscale_enabled { 1_i64 } else { 0_i64 };
        let result_required = if input.result_required { 1_i64 } else { 0_i64 };
        if input.is_update {
            let result = sqlx::query!(
                r#"
                UPDATE time_step_preset
                SET name = ?2,
                    default_duration_seconds = ?3,
                    auto_advance = ?4,
                    record_save_enabled = ?5,
                    capture_enabled = ?6,
                    grayscale_enabled = ?7,
                    result_required = ?8,
                    result_save_path = ?9,
                    updated_at = ?10
                WHERE id = ?1
                "#,
                input.id,
                input.name,
                input.default_duration_seconds,
                auto_advance,
                record_save_enabled,
                capture_enabled,
                grayscale_enabled,
                result_required,
                input.result_save_path,
                input.timestamp
            )
            .execute(&mut **tx)
            .await?;

            if result.rows_affected() == 0 {
                bail!("Time step preset not found");
            }
        } else {
            sqlx::query!(
                r#"
                INSERT INTO time_step_preset
                (
                    id,
                    name,
                    default_duration_seconds,
                    auto_advance,
                    record_save_enabled,
                    capture_enabled,
                    grayscale_enabled,
                    result_required,
                    result_save_path,
                    created_at,
                    updated_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
                "#,
                input.id,
                input.name,
                input.default_duration_seconds,
                auto_advance,
                record_save_enabled,
                capture_enabled,
                grayscale_enabled,
                result_required,
                input.result_save_path,
                input.timestamp
            )
            .execute(&mut **tx)
            .await?;
        }

        Ok(())
    }

    pub async fn replace_session_preset_tags_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        preset_id: &str,
        tag_ids: &[String],
        created_at: &str,
    ) -> Result<()> {
        sqlx::query!(
            "DELETE FROM session_preset_tag WHERE session_preset_id = ?1",
            preset_id
        )
        .execute(&mut **tx)
        .await?;

        for tag_id in tag_ids {
            sqlx::query!(
                "INSERT OR IGNORE INTO session_preset_tag (session_preset_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
                preset_id,
                tag_id,
                created_at
            )
            .execute(&mut **tx)
            .await?;
        }

        Ok(())
    }

    pub async fn replace_time_step_preset_tags_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        preset_id: &str,
        tag_ids: &[String],
        created_at: &str,
    ) -> Result<()> {
        sqlx::query!(
            "DELETE FROM time_step_preset_tag WHERE time_step_preset_id = ?1",
            preset_id
        )
        .execute(&mut **tx)
        .await?;

        for tag_id in tag_ids {
            sqlx::query!(
                "INSERT OR IGNORE INTO time_step_preset_tag (time_step_preset_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
                preset_id,
                tag_id,
                created_at
            )
            .execute(&mut **tx)
            .await?;
        }

        Ok(())
    }

    pub async fn delete_time_step_preset_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        preset_id: &str,
    ) -> Result<()> {
        let usage_count = sqlx::query_scalar!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM session_step_preset
            WHERE time_step_preset_id = ?1
            "#,
            preset_id
        )
        .fetch_one(&mut **tx)
        .await?;

        if usage_count > 0 {
            bail!("Time step preset is used by a session preset");
        }

        let result = sqlx::query!(
            "DELETE FROM time_step_preset WHERE id = ?1",
            preset_id
        )
        .execute(&mut **tx)
        .await?;

        if result.rows_affected() == 0 {
            bail!("Time step preset not found");
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
}

fn tag_from_join_row(row: &SessionStepPresetJoinRow) -> Option<Tag> {
    row.tag_id.clone().map(|tag_id| Tag {
        id: tag_id,
        group_id: row.group_id.clone(),
        name: row.tag_name.clone().unwrap_or_default(),
        color: row.color.clone(),
        sort_order: row.sort_order.unwrap_or_default(),
        created_at: row.tag_created_at.clone().unwrap_or_default(),
        updated_at: row.tag_updated_at.clone().unwrap_or_default(),
    })
}

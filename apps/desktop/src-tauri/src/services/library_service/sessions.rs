use std::collections::HashMap;

use anyhow::{anyhow, Result};
use sqlx::Row;

use crate::{
    models::library::{
        CroquisRecordSummary, DeleteSessionPresetPayload,
        SaveCroquisRecordPayload, SaveSessionPresetPayload, SessionDetail,
        SessionPreset, SessionPresetStepDraft, SessionStepPreset,
        SessionSummary, Tag,
    },
    utils::{date::get_now_date, identifier::get_unique_id},
};

use super::{
    mappers::{record_summary_from_row, session_summary_from_row},
    records::save_record,
    runtime::pool,
    tags::ensure_tags_by_names,
    LIBRARY_ID,
};

pub async fn list_recent_sessions(limit: i64) -> Result<Vec<SessionSummary>> {
    let pool = pool()?;
    let rows = sqlx::query(
        r#"
        SELECT s.id, s.title, s.preset_id, s.started_at, s.finished_at, s.created_at, s.updated_at,
               (
                   SELECT COUNT(*)
                   FROM croquis_record r
                   WHERE r.session_id = s.id
               ) AS record_count,
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
    )
    .bind(limit)
    .fetch_all(&pool)
    .await?;

    rows.into_iter().map(session_summary_from_row).collect()
}

pub async fn get_session_detail(session_id: &str) -> Result<SessionDetail> {
    let pool = pool()?;
    let row = sqlx::query(
        r#"
        SELECT s.id, s.title, s.preset_id, s.started_at, s.finished_at, s.created_at, s.updated_at,
               (
                   SELECT COUNT(*)
                   FROM croquis_record r
                   WHERE r.session_id = s.id
               ) AS record_count,
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
    )
    .bind(session_id)
    .fetch_one(&pool)
    .await?;
    let summary = session_summary_from_row(row)?;

    let records = sqlx::query(
        r#"
        SELECT id, title, source_asset_id, result_asset_id, session_id, step_index, step_name,
               target_duration_seconds, started_at, finished_at, finalized_at, created_at, updated_at
        FROM croquis_record
        WHERE session_id = ?1
        ORDER BY COALESCE(step_index, 999999) ASC, created_at ASC
        "#,
    )
    .bind(session_id)
    .fetch_all(&pool)
    .await?
    .into_iter()
    .map(record_summary_from_row)
    .collect::<Result<Vec<CroquisRecordSummary>>>()?;

    let preset = match summary.preset_id.as_deref() {
        Some(target_id) => list_session_presets()
            .await?
            .into_iter()
            .find(|candidate| candidate.id == target_id),
        None => None,
    };

    Ok(SessionDetail { summary, preset, records })
}

pub async fn list_session_presets() -> Result<Vec<SessionPreset>> {
    let pool = pool()?;
    let preset_rows = sqlx::query(
        r#"
        SELECT id, name, description, is_default, created_at, updated_at
        FROM session_preset
        ORDER BY is_default DESC, created_at ASC
        "#,
    )
    .fetch_all(&pool)
    .await?;

    let step_rows = sqlx::query(
        r#"
        SELECT ssp.id, ssp.preset_id, ssp.step_order, ssp.name, ssp.default_duration_seconds,
               ssp.result_required, ssp.created_at, ssp.updated_at,
               t.id AS tag_id, t.group_id, t.name AS tag_name, t.color, t.sort_order,
               t.created_at AS tag_created_at, t.updated_at AS tag_updated_at
        FROM session_step_preset ssp
        LEFT JOIN session_step_preset_tag sspt ON sspt.step_preset_id = ssp.id
        LEFT JOIN tag t ON t.id = sspt.tag_id
        ORDER BY ssp.preset_id ASC, ssp.step_order ASC, t.name ASC
        "#,
    )
    .fetch_all(&pool)
    .await?;

    let mut steps_by_preset: HashMap<String, Vec<SessionStepPreset>> =
        HashMap::new();
    let mut step_index: HashMap<String, (String, usize)> = HashMap::new();

    for row in step_rows {
        let step_id: String = row.try_get("id")?;
        let preset_id: String = row.try_get("preset_id")?;

        let entry = steps_by_preset.entry(preset_id.clone()).or_default();
        if let Some((existing_preset_id, index)) = step_index.get(&step_id) {
            if existing_preset_id == &preset_id {
                if let Some(tag_id) =
                    row.try_get::<Option<String>, _>("tag_id")?
                {
                    entry[*index].auto_tags.push(Tag {
                        id: tag_id,
                        group_id: row.try_get("group_id")?,
                        name: row.try_get("tag_name")?,
                        color: row.try_get("color")?,
                        sort_order: row.try_get("sort_order")?,
                        created_at: row.try_get("tag_created_at")?,
                        updated_at: row.try_get("tag_updated_at")?,
                    });
                }
                continue;
            }
        }

        let mut step = SessionStepPreset {
            id: step_id.clone(),
            step_order: row.try_get("step_order")?,
            name: row.try_get("name")?,
            default_duration_seconds: row
                .try_get("default_duration_seconds")?,
            auto_tags: Vec::new(),
            result_required: row.try_get::<i64, _>("result_required")? != 0,
        };

        if let Some(tag_id) = row.try_get::<Option<String>, _>("tag_id")? {
            step.auto_tags.push(Tag {
                id: tag_id,
                group_id: row.try_get("group_id")?,
                name: row.try_get("tag_name")?,
                color: row.try_get("color")?,
                sort_order: row.try_get("sort_order")?,
                created_at: row.try_get("tag_created_at")?,
                updated_at: row.try_get("tag_updated_at")?,
            });
        }

        step_index.insert(step_id, (preset_id.clone(), entry.len()));
        entry.push(step);
    }

    let presets = preset_rows
        .into_iter()
        .map(|row| -> Result<SessionPreset> {
            let id: String = row.try_get("id")?;
            Ok(SessionPreset {
                id: id.clone(),
                name: row.try_get("name")?,
                description: row.try_get("description")?,
                is_default: row.try_get::<i64, _>("is_default")? != 0,
                steps: steps_by_preset.remove(&id).unwrap_or_default(),
                created_at: row.try_get("created_at")?,
                updated_at: row.try_get("updated_at")?,
            })
        })
        .collect::<Result<Vec<SessionPreset>>>()?;

    Ok(presets)
}

pub async fn save_session_preset(
    payload: SaveSessionPresetPayload,
) -> Result<Vec<SessionPreset>> {
    let pool = pool()?;
    let now = get_now_date();
    let preset_id = payload.id.clone().unwrap_or_else(get_unique_id);
    let mut tx = pool.begin().await?;

    if payload.is_default {
        sqlx::query(
            "UPDATE session_preset SET is_default = 0, updated_at = ?1",
        )
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }

    if payload.id.is_some() {
        sqlx::query(
            r#"
            UPDATE session_preset
            SET name = ?2, description = ?3, is_default = ?4, updated_at = ?5
            WHERE id = ?1
            "#,
        )
        .bind(&preset_id)
        .bind(&payload.name)
        .bind(payload.description.as_deref())
        .bind(if payload.is_default { 1 } else { 0 })
        .bind(&now)
        .execute(&mut *tx)
        .await?;
        sqlx::query("DELETE FROM session_step_preset_tag WHERE step_preset_id IN (SELECT id FROM session_step_preset WHERE preset_id = ?1)")
            .bind(&preset_id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM session_step_preset WHERE preset_id = ?1")
            .bind(&preset_id)
            .execute(&mut *tx)
            .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO session_preset
            (id, name, description, is_default, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?5)
            "#,
        )
        .bind(&preset_id)
        .bind(&payload.name)
        .bind(payload.description.as_deref())
        .bind(if payload.is_default { 1 } else { 0 })
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }

    for step in &payload.steps {
        save_session_preset_step(&mut tx, &preset_id, step).await?;
    }

    if payload.is_default {
        sqlx::query(
            "UPDATE library_settings SET active_session_preset_id = ?2, updated_at = ?3 WHERE id = ?1",
        )
        .bind(LIBRARY_ID)
        .bind(&preset_id)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    list_session_presets().await
}

async fn save_session_preset_step(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    preset_id: &str,
    draft: &SessionPresetStepDraft,
) -> Result<()> {
    let step_id = draft.id.clone().unwrap_or_else(get_unique_id);
    let now = get_now_date();
    sqlx::query(
        r#"
        INSERT INTO session_step_preset
        (id, preset_id, step_order, name, default_duration_seconds, result_required, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
        "#,
    )
    .bind(&step_id)
    .bind(preset_id)
    .bind(draft.step_order)
    .bind(&draft.name)
    .bind(draft.default_duration_seconds)
    .bind(if draft.result_required { 1 } else { 0 })
    .bind(&now)
    .execute(&mut **tx)
    .await?;

    let tags = ensure_tags_by_names(tx, &draft.auto_tag_names).await?;
    for tag in &tags {
        sqlx::query(
            "INSERT OR IGNORE INTO session_step_preset_tag (step_preset_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
        )
        .bind(&step_id)
        .bind(&tag.id)
        .bind(&now)
        .execute(&mut **tx)
        .await?;
    }
    Ok(())
}

pub async fn delete_session_preset(
    payload: DeleteSessionPresetPayload,
) -> Result<Vec<SessionPreset>> {
    let pool = pool()?;
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM session_preset WHERE id = ?1")
        .bind(&payload.preset_id)
        .execute(&mut *tx)
        .await?;

    let remaining_default: Option<String> = sqlx::query_scalar(
        "SELECT id FROM session_preset WHERE is_default = 1 LIMIT 1",
    )
    .fetch_optional(&mut *tx)
    .await?;

    if remaining_default.is_none() {
        if let Some(first_preset_id) = sqlx::query_scalar::<_, String>(
            "SELECT id FROM session_preset ORDER BY created_at ASC LIMIT 1",
        )
        .fetch_optional(&mut *tx)
        .await?
        {
            let now = get_now_date();
            sqlx::query("UPDATE session_preset SET is_default = 1, updated_at = ?2 WHERE id = ?1")
                .bind(&first_preset_id)
                .bind(&now)
                .execute(&mut *tx)
                .await?;
            sqlx::query(
                "UPDATE library_settings SET active_session_preset_id = ?2, updated_at = ?3 WHERE id = ?1",
            )
            .bind(LIBRARY_ID)
            .bind(&first_preset_id)
            .bind(&now)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;
    list_session_presets().await
}

pub async fn load_session_preset(
    preset_id: Option<&str>,
) -> Result<SessionPreset> {
    let presets = list_session_presets().await?;
    if let Some(target_id) = preset_id {
        if let Some(preset) =
            presets.iter().find(|preset| preset.id == target_id)
        {
            return Ok(preset.clone());
        }
    }

    presets
        .iter()
        .find(|preset| preset.is_default)
        .cloned()
        .or_else(|| presets.into_iter().next())
        .ok_or_else(|| anyhow!("No session presets available"))
}

pub async fn create_session(
    title: &str,
    preset_id: Option<&str>,
) -> Result<String> {
    let pool = pool()?;
    let now = get_now_date();
    let session_id = get_unique_id();
    sqlx::query(
        r#"
        INSERT INTO session
        (id, preset_id, title, started_at, finished_at, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, NULL, ?4, ?4)
        "#,
    )
    .bind(&session_id)
    .bind(preset_id)
    .bind(title)
    .bind(&now)
    .execute(&pool)
    .await?;
    Ok(session_id)
}

pub async fn create_session_record(
    source_asset_id: &str,
    session_id: &str,
    step: &SessionStepPreset,
    title: &str,
) -> Result<CroquisRecordSummary> {
    let record = save_record(SaveCroquisRecordPayload {
        id: None,
        source_asset_id: Some(source_asset_id.to_string()),
        result_asset_id: None,
        session_id: Some(session_id.to_string()),
        step_index: Some(step.step_order),
        step_name: Some(step.name.clone()),
        title: Some(title.to_string()),
        note: None,
        target_duration_seconds: step.default_duration_seconds,
        tag_ids: step.auto_tags.iter().map(|tag| tag.id.clone()).collect(),
    })
    .await?;

    Ok(record.record)
}

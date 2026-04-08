use anyhow::Result;
use sqlx::Row;

use crate::{
    models::library::{
        CroquisRecordDetail, CroquisRecordSummary, DeleteCroquisRecordPayload,
        FinalizeCroquisRecordPayload, SaveCroquisRecordPayload, Tag,
        UpdateCroquisRecordTagsPayload,
    },
    utils::{date::get_now_date, identifier::get_unique_id},
};

use super::{
    assets::get_asset,
    mappers::{record_summary_from_row, tag_from_row},
    runtime::pool,
};

pub async fn list_recent_records(
    limit: i64,
) -> Result<Vec<CroquisRecordSummary>> {
    let pool = pool()?;
    let rows = sqlx::query(
        r#"
        SELECT id, title, source_asset_id, result_asset_id, session_id, step_index, step_name,
               target_duration_seconds, started_at, finished_at, finalized_at, created_at, updated_at
        FROM croquis_record
        ORDER BY created_at DESC
        LIMIT ?1
        "#,
    )
    .bind(limit)
    .fetch_all(&pool)
    .await?;

    rows.into_iter().map(record_summary_from_row).collect()
}

pub async fn get_record(record_id: &str) -> Result<CroquisRecordDetail> {
    let pool = pool()?;
    let row = sqlx::query(
        r#"
        SELECT id, title, note, source_asset_id, result_asset_id, session_id, step_index, step_name,
               target_duration_seconds, started_at, finished_at, finalized_at, created_at, updated_at
        FROM croquis_record
        WHERE id = ?1
        "#,
    )
    .bind(record_id)
    .fetch_one(&pool)
    .await?;

    let source_asset_id: Option<String> = row.try_get("source_asset_id")?;
    let result_asset_id: Option<String> = row.try_get("result_asset_id")?;
    let note: String = row.try_get("note")?;
    let summary = CroquisRecordSummary {
        id: row.try_get("id")?,
        title: row.try_get("title")?,
        source_asset_id: source_asset_id.clone(),
        result_asset_id: result_asset_id.clone(),
        session_id: row.try_get("session_id")?,
        step_index: row.try_get("step_index")?,
        step_name: row.try_get("step_name")?,
        target_duration_seconds: row.try_get("target_duration_seconds")?,
        started_at: row.try_get("started_at")?,
        finished_at: row.try_get("finished_at")?,
        finalized_at: row.try_get("finalized_at")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    };

    let source_asset = match source_asset_id.as_deref() {
        Some(asset_id) => Some(get_asset(asset_id).await?.asset),
        None => None,
    };
    let result_asset = match result_asset_id.as_deref() {
        Some(asset_id) => Some(get_asset(asset_id).await?.asset),
        None => None,
    };

    let tag_rows = sqlx::query(
        r#"
        SELECT t.id, t.group_id, t.name, t.color, t.sort_order, t.created_at, t.updated_at
        FROM tag t
        INNER JOIN croquis_record_tag crt ON crt.tag_id = t.id
        WHERE crt.record_id = ?1
        ORDER BY t.name ASC
        "#,
    )
    .bind(record_id)
    .fetch_all(&pool)
    .await?;

    Ok(CroquisRecordDetail {
        record: summary,
        note,
        source_asset,
        result_asset,
        tags: tag_rows
            .into_iter()
            .map(tag_from_row)
            .collect::<Result<Vec<Tag>>>()?,
    })
}

pub async fn save_record(
    payload: SaveCroquisRecordPayload,
) -> Result<CroquisRecordDetail> {
    let pool = pool()?;
    let now = get_now_date();
    let record_id = payload.id.clone().unwrap_or_else(get_unique_id);
    let title = payload.title.clone().unwrap_or_else(|| {
        payload
            .step_name
            .clone()
            .unwrap_or_else(|| "Croquis Record".to_string())
    });

    let mut tx = pool.begin().await?;
    if payload.id.is_some() {
        sqlx::query(
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
        )
        .bind(&record_id)
        .bind(payload.source_asset_id.as_deref())
        .bind(payload.result_asset_id.as_deref())
        .bind(payload.session_id.as_deref())
        .bind(payload.step_index)
        .bind(payload.step_name.as_deref())
        .bind(&title)
        .bind(payload.note.as_deref())
        .bind(payload.target_duration_seconds)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO croquis_record
            (id, source_asset_id, result_asset_id, session_id, step_index, step_name, title, note,
             target_duration_seconds, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, COALESCE(?8, ''), ?9, ?10, ?10)
            "#,
        )
        .bind(&record_id)
        .bind(payload.source_asset_id.as_deref())
        .bind(payload.result_asset_id.as_deref())
        .bind(payload.session_id.as_deref())
        .bind(payload.step_index)
        .bind(payload.step_name.as_deref())
        .bind(&title)
        .bind(payload.note.as_deref())
        .bind(payload.target_duration_seconds)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query("DELETE FROM croquis_record_tag WHERE record_id = ?1")
        .bind(&record_id)
        .execute(&mut *tx)
        .await?;

    for tag_id in &payload.tag_ids {
        sqlx::query(
            "INSERT OR IGNORE INTO croquis_record_tag (record_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
        )
        .bind(&record_id)
        .bind(tag_id)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    get_record(&record_id).await
}

pub async fn delete_record(payload: DeleteCroquisRecordPayload) -> Result<()> {
    let pool = pool()?;
    sqlx::query("DELETE FROM croquis_record WHERE id = ?1")
        .bind(&payload.record_id)
        .execute(&pool)
        .await?;
    Ok(())
}

pub async fn update_record_tags(
    payload: UpdateCroquisRecordTagsPayload,
) -> Result<CroquisRecordDetail> {
    let pool = pool()?;
    let now = get_now_date();
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM croquis_record_tag WHERE record_id = ?1")
        .bind(&payload.record_id)
        .execute(&mut *tx)
        .await?;

    for tag_id in &payload.tag_ids {
        sqlx::query(
            "INSERT OR IGNORE INTO croquis_record_tag (record_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
        )
        .bind(&payload.record_id)
        .bind(tag_id)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    get_record(&payload.record_id).await
}

pub async fn mark_record_started(
    record_id: &str,
) -> Result<CroquisRecordDetail> {
    let pool = pool()?;
    let now = get_now_date();
    sqlx::query(
        r#"
        UPDATE croquis_record
        SET started_at = COALESCE(started_at, ?2),
            updated_at = ?2
        WHERE id = ?1
        "#,
    )
    .bind(record_id)
    .bind(&now)
    .execute(&pool)
    .await?;
    get_record(record_id).await
}

pub async fn finalize_record(
    payload: FinalizeCroquisRecordPayload,
) -> Result<CroquisRecordDetail> {
    let pool = pool()?;
    let now = get_now_date();
    let finished_at = payload.finished_at.unwrap_or_else(|| now.clone());
    let finalized_at = payload.finalized_at.unwrap_or_else(|| now.clone());
    let title_suffix =
        payload.actual_duration_seconds.map(|value| format!(" ({value:.1}s)"));

    sqlx::query(
        r#"
        UPDATE croquis_record
        SET finished_at = COALESCE(?2, finished_at),
            finalized_at = COALESCE(?3, finalized_at),
            updated_at = ?4
        WHERE id = ?1
        "#,
    )
    .bind(&payload.record_id)
    .bind(Some(finished_at.as_str()))
    .bind(Some(finalized_at.as_str()))
    .bind(&now)
    .execute(&pool)
    .await?;

    if let Some(suffix) = title_suffix {
        sqlx::query(
            "UPDATE croquis_record SET title = TRIM(title || ?2), updated_at = ?3 WHERE id = ?1 AND title NOT LIKE ?4",
        )
        .bind(&payload.record_id)
        .bind(&suffix)
        .bind(&now)
        .bind(format!("%{suffix}"))
        .execute(&pool)
        .await?;
    }

    get_record(&payload.record_id).await
}

pub async fn attach_result_asset(
    record_id: &str,
    result_asset_id: &str,
    actual_duration_seconds: Option<f64>,
) -> Result<CroquisRecordDetail> {
    let pool = pool()?;
    let now = get_now_date();
    let _ = actual_duration_seconds;

    sqlx::query(
        r#"
        UPDATE croquis_record
        SET result_asset_id = ?2,
            finished_at = COALESCE(finished_at, ?3),
            finalized_at = ?3,
            updated_at = ?3
        WHERE id = ?1
        "#,
    )
    .bind(record_id)
    .bind(result_asset_id)
    .bind(&now)
    .execute(&pool)
    .await?;

    get_record(record_id).await
}

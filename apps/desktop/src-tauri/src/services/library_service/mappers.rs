use anyhow::Result;
use sqlx::Row;

use crate::models::library::{
    AssetSummary, AssetType, CroquisRecordSummary, SessionSummary, Tag,
    VirtualFolder,
};

pub(super) fn asset_type_from_db(value: &str) -> AssetType {
    match value {
        "linked_external" => AssetType::LinkedExternal,
        _ => AssetType::ImportedImage,
    }
}

pub(super) fn asset_from_row(
    row: sqlx::sqlite::SqliteRow,
) -> Result<AssetSummary> {
    Ok(AssetSummary {
        id: row.try_get("id")?,
        r#type: asset_type_from_db(row.try_get::<&str, _>("type")?),
        hash: row.try_get("hash")?,
        storage_path: row.try_get("storage_path")?,
        external_path: row.try_get("external_path")?,
        thumbnail_path: row.try_get("thumbnail_path")?,
        file_name: row.try_get("file_name")?,
        file_size: row.try_get("file_size")?,
        mime_type: row.try_get("mime_type")?,
        width: row.try_get("width")?,
        height: row.try_get("height")?,
        modified_at: row.try_get("modified_at")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

pub(super) fn folder_from_row(
    row: sqlx::sqlite::SqliteRow,
) -> Result<VirtualFolder> {
    Ok(VirtualFolder {
        id: row.try_get("id")?,
        parent_id: row.try_get("parent_id")?,
        name: row.try_get("name")?,
        full_path: row.try_get("full_path")?,
        alias: row.try_get("alias")?,
        sort_order: row.try_get("sort_order")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

pub(super) fn tag_from_row(row: sqlx::sqlite::SqliteRow) -> Result<Tag> {
    Ok(Tag {
        id: row.try_get("id")?,
        group_id: row.try_get("group_id")?,
        name: row.try_get("name")?,
        color: row.try_get("color")?,
        sort_order: row.try_get("sort_order")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

pub(super) fn record_summary_from_row(
    row: sqlx::sqlite::SqliteRow,
) -> Result<CroquisRecordSummary> {
    Ok(CroquisRecordSummary {
        id: row.try_get("id")?,
        title: row.try_get("title")?,
        source_asset_id: row.try_get("source_asset_id")?,
        result_asset_id: row.try_get("result_asset_id")?,
        session_id: row.try_get("session_id")?,
        step_index: row.try_get("step_index")?,
        step_name: row.try_get("step_name")?,
        target_duration_seconds: row.try_get("target_duration_seconds")?,
        started_at: row.try_get("started_at")?,
        finished_at: row.try_get("finished_at")?,
        finalized_at: row.try_get("finalized_at")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

pub(super) fn session_summary_from_row(
    row: sqlx::sqlite::SqliteRow,
) -> Result<SessionSummary> {
    Ok(SessionSummary {
        id: row.try_get("id")?,
        title: row.try_get("title")?,
        preset_id: row.try_get("preset_id")?,
        started_at: row.try_get("started_at")?,
        finished_at: row.try_get("finished_at")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
        record_count: row.try_get("record_count")?,
        first_record_id: row.try_get("first_record_id")?,
    })
}

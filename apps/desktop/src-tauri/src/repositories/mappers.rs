use crate::models::{
    asset::{AssetSummary, AssetType},
    folder::VirtualFolder,
    record::CroquisRecordSummary,
    session::SessionSummary,
    tag::{Tag, TagGroup},
};

pub(crate) struct AssetRow {
    pub id: String,
    pub type_: String,
    pub hash: Option<String>,
    pub storage_path: Option<String>,
    pub external_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub file_name: String,
    pub file_size: i64,
    pub mime_type: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub modified_at: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

pub(crate) struct VirtualFolderRow {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub full_path: String,
    pub alias: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

pub(crate) struct TagGroupRow {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

pub(crate) struct TagRow {
    pub id: String,
    pub group_id: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

pub(crate) struct CroquisRecordSummaryRow {
    pub id: String,
    pub title: String,
    pub source_asset_id: Option<String>,
    pub result_asset_id: Option<String>,
    pub session_id: Option<String>,
    pub step_index: Option<i64>,
    pub step_name: Option<String>,
    pub target_duration_seconds: Option<i64>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub finalized_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub(crate) struct CroquisRecordDetailRow {
    pub id: String,
    pub title: String,
    pub note: String,
    pub source_asset_id: Option<String>,
    pub result_asset_id: Option<String>,
    pub session_id: Option<String>,
    pub step_index: Option<i64>,
    pub step_name: Option<String>,
    pub target_duration_seconds: Option<i64>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub finalized_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub(crate) struct SessionSummaryRow {
    pub id: String,
    pub title: String,
    pub preset_id: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub record_count: i64,
    pub first_record_id: Option<String>,
}

pub(crate) struct SessionPresetRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

pub(crate) struct SessionStepPresetJoinRow {
    pub id: String,
    pub preset_id: String,
    pub step_order: i64,
    pub name: String,
    pub default_duration_seconds: Option<i64>,
    pub result_required: bool,
    pub tag_id: Option<String>,
    pub group_id: Option<String>,
    pub tag_name: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<i64>,
    pub tag_created_at: Option<String>,
    pub tag_updated_at: Option<String>,
}

pub(crate) fn asset_type_from_db(value: &str) -> AssetType {
    match value {
        "linked_external" => AssetType::LinkedExternal,
        _ => AssetType::ImportedImage,
    }
}

pub(crate) fn asset_from_row(row: AssetRow) -> AssetSummary {
    AssetSummary {
        id: row.id,
        r#type: asset_type_from_db(&row.type_),
        hash: row.hash,
        storage_path: row.storage_path,
        external_path: row.external_path,
        thumbnail_path: row.thumbnail_path,
        file_name: row.file_name,
        file_size: row.file_size,
        mime_type: row.mime_type,
        width: row.width,
        height: row.height,
        modified_at: row.modified_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

pub(crate) fn folder_from_row(row: VirtualFolderRow) -> VirtualFolder {
    VirtualFolder {
        id: row.id,
        parent_id: row.parent_id,
        name: row.name,
        full_path: row.full_path,
        alias: row.alias,
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

pub(crate) fn tag_group_from_row(row: TagGroupRow) -> TagGroup {
    TagGroup {
        id: row.id,
        name: row.name,
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

pub(crate) fn tag_from_row(row: TagRow) -> Tag {
    Tag {
        id: row.id,
        group_id: row.group_id,
        name: row.name,
        color: row.color,
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

pub(crate) fn record_summary_from_row(
    row: CroquisRecordSummaryRow,
) -> CroquisRecordSummary {
    CroquisRecordSummary {
        id: row.id,
        title: row.title,
        source_asset_id: row.source_asset_id,
        result_asset_id: row.result_asset_id,
        session_id: row.session_id,
        step_index: row.step_index,
        step_name: row.step_name,
        target_duration_seconds: row.target_duration_seconds,
        started_at: row.started_at,
        finished_at: row.finished_at,
        finalized_at: row.finalized_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

pub(crate) fn record_detail_row_into_summary(
    row: &CroquisRecordDetailRow,
) -> CroquisRecordSummary {
    CroquisRecordSummary {
        id: row.id.clone(),
        title: row.title.clone(),
        source_asset_id: row.source_asset_id.clone(),
        result_asset_id: row.result_asset_id.clone(),
        session_id: row.session_id.clone(),
        step_index: row.step_index,
        step_name: row.step_name.clone(),
        target_duration_seconds: row.target_duration_seconds,
        started_at: row.started_at.clone(),
        finished_at: row.finished_at.clone(),
        finalized_at: row.finalized_at.clone(),
        created_at: row.created_at.clone(),
        updated_at: row.updated_at.clone(),
    }
}

pub(crate) fn session_summary_from_row(
    row: SessionSummaryRow,
) -> SessionSummary {
    SessionSummary {
        id: row.id,
        title: row.title,
        preset_id: row.preset_id,
        started_at: row.started_at,
        finished_at: row.finished_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        record_count: row.record_count,
        first_record_id: row.first_record_id,
    }
}

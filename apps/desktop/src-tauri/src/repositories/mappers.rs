use crate::models::{
    asset::AssetSummary,
    folder::{VirtualFolder, VirtualFolderKind},
    record::CroquisRecordSummary,
    tag::{Tag, TagGroup},
};

pub(crate) struct AssetRow {
    pub id: String,
    pub hash: String,
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
    pub kind: String,
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
    pub target_duration_seconds: Option<i64>,
    pub actual_duration_seconds: Option<f64>,
    pub finished_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub(crate) struct CroquisRecordDetailRow {
    pub id: String,
    pub title: String,
    pub note: String,
    pub source_asset_id: Option<String>,
    pub result_asset_id: Option<String>,
    pub target_duration_seconds: Option<i64>,
    pub actual_duration_seconds: Option<f64>,
    pub finished_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
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
    pub result_external_path: Option<String>,
    pub tag_id: Option<String>,
    pub group_id: Option<String>,
    pub tag_name: Option<String>,
    pub color: Option<String>,
    pub sort_order: Option<i64>,
    pub tag_created_at: Option<String>,
    pub tag_updated_at: Option<String>,
}

pub(crate) fn asset_from_row(row: AssetRow) -> AssetSummary {
    AssetSummary {
        id: row.id,
        hash: row.hash,
        storage_path: None,
        thumbnail_path: None,
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
        kind: VirtualFolderKind::from_db(&row.kind),
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
        target_duration_seconds: row.target_duration_seconds,
        actual_duration_seconds: row.actual_duration_seconds,
        finished_at: row.finished_at,
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
        target_duration_seconds: row.target_duration_seconds,
        actual_duration_seconds: row.actual_duration_seconds,
        finished_at: row.finished_at.clone(),
        created_at: row.created_at.clone(),
        updated_at: row.updated_at.clone(),
    }
}

use tauri::State;

use crate::{
    errors::{CommandResult, IntoCommandResult},
    models::record::{
        CroquisRecordDetail, CroquisRecordSummary, DeleteCroquisRecordPayload,
        FinalizeCroquisRecordPayload, SaveCroquisRecordPayload,
        UpdateCroquisRecordTagsPayload,
    },
    services::RecordService,
};

#[tauri::command]
pub async fn list_recent_records(
    limit: Option<i64>,
    record_service: State<'_, RecordService>,
) -> CommandResult<Vec<CroquisRecordSummary>> {
    record_service.list_recent_records(limit.unwrap_or(24)).await.into_command()
}

#[tauri::command]
pub async fn get_record_detail(
    record_id: String,
    record_service: State<'_, RecordService>,
) -> CommandResult<CroquisRecordDetail> {
    record_service.get_record(&record_id).await.into_command()
}

#[tauri::command]
pub async fn save_croquis_record(
    payload: SaveCroquisRecordPayload,
    record_service: State<'_, RecordService>,
) -> CommandResult<CroquisRecordDetail> {
    record_service.save_record(payload).await.into_command()
}

#[tauri::command]
pub async fn delete_croquis_record(
    payload: DeleteCroquisRecordPayload,
    record_service: State<'_, RecordService>,
) -> CommandResult<()> {
    record_service.delete_record(payload).await.into_command()
}

#[tauri::command]
pub async fn start_croquis_record(
    record_id: String,
    record_service: State<'_, RecordService>,
) -> CommandResult<CroquisRecordDetail> {
    record_service.mark_record_started(&record_id).await.into_command()
}

#[tauri::command]
pub async fn finalize_croquis_record(
    payload: FinalizeCroquisRecordPayload,
    record_service: State<'_, RecordService>,
) -> CommandResult<CroquisRecordDetail> {
    record_service.finalize_record(payload).await.into_command()
}

#[tauri::command]
pub async fn update_croquis_record_tags(
    payload: UpdateCroquisRecordTagsPayload,
    record_service: State<'_, RecordService>,
) -> CommandResult<CroquisRecordDetail> {
    record_service.update_record_tags(payload).await.into_command()
}

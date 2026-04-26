use tauri::State;

use crate::{
    errors::{CommandResult, IntoCommandResult},
    models::record::{
        CroquisRecordDetail, CroquisRecordSummary, DeleteCroquisRecordPayload,
        FinishCroquisRecordPayload, SaveCroquisRecordPayload,
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
pub async fn finish_croquis_record(
    payload: FinishCroquisRecordPayload,
    record_service: State<'_, RecordService>,
) -> CommandResult<CroquisRecordDetail> {
    record_service.finish_record(payload).await.into_command()
}

#[tauri::command]
pub async fn update_croquis_record_tags(
    payload: UpdateCroquisRecordTagsPayload,
    record_service: State<'_, RecordService>,
) -> CommandResult<CroquisRecordDetail> {
    record_service.update_record_tags(payload).await.into_command()
}

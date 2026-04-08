use tauri::State;

use crate::{
    models::library::{
        CroquisRecordDetail, CroquisRecordSummary, DeleteCroquisRecordPayload,
        FinalizeCroquisRecordPayload, SaveCroquisRecordPayload,
        UpdateCroquisRecordTagsPayload,
    },
    services::LibraryService,
};

#[tauri::command]
pub async fn list_recent_records(
    limit: Option<i64>,
    library_service: State<'_, LibraryService>,
) -> Result<Vec<CroquisRecordSummary>, String> {
    library_service
        .list_recent_records(limit.unwrap_or(24))
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn get_record_detail(
    record_id: String,
    library_service: State<'_, LibraryService>,
) -> Result<CroquisRecordDetail, String> {
    library_service.get_record(&record_id).await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn save_croquis_record(
    payload: SaveCroquisRecordPayload,
    library_service: State<'_, LibraryService>,
) -> Result<CroquisRecordDetail, String> {
    library_service.save_record(payload).await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn delete_croquis_record(
    payload: DeleteCroquisRecordPayload,
    library_service: State<'_, LibraryService>,
) -> Result<(), String> {
    library_service.delete_record(payload).await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn start_croquis_record(
    record_id: String,
    library_service: State<'_, LibraryService>,
) -> Result<CroquisRecordDetail, String> {
    library_service
        .mark_record_started(&record_id)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn finalize_croquis_record(
    payload: FinalizeCroquisRecordPayload,
    library_service: State<'_, LibraryService>,
) -> Result<CroquisRecordDetail, String> {
    library_service
        .finalize_record(payload)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn update_croquis_record_tags(
    payload: UpdateCroquisRecordTagsPayload,
    library_service: State<'_, LibraryService>,
) -> Result<CroquisRecordDetail, String> {
    library_service
        .update_record_tags(payload)
        .await
        .map_err(|err| err.to_string())
}

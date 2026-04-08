use tauri::State;

use crate::{
    models::library::{ImportRequest, ImportResult},
    services::LibraryService,
};

#[tauri::command]
pub async fn import_images(
    payload: ImportRequest,
    library_service: State<'_, LibraryService>,
) -> Result<ImportResult, String> {
    library_service.import_images(payload).await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn link_external_files(
    payload: ImportRequest,
    library_service: State<'_, LibraryService>,
) -> Result<ImportResult, String> {
    library_service
        .link_external_files(payload)
        .await
        .map_err(|err| err.to_string())
}

use tauri::State;

use crate::{
    models::library::{
        DeleteTagGroupPayload, DeleteTagPayload, SaveTagGroupPayload,
        SaveTagPayload, TagIndex,
    },
    services::LibraryService,
};

#[tauri::command]
pub async fn load_tag_index(
    library_service: State<'_, LibraryService>,
) -> Result<TagIndex, String> {
    library_service.load_tag_index().await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn save_tag_group(
    payload: SaveTagGroupPayload,
    library_service: State<'_, LibraryService>,
) -> Result<TagIndex, String> {
    library_service.save_tag_group(payload).await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn delete_tag_group(
    payload: DeleteTagGroupPayload,
    library_service: State<'_, LibraryService>,
) -> Result<TagIndex, String> {
    library_service
        .delete_tag_group(payload)
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn save_tag(
    payload: SaveTagPayload,
    library_service: State<'_, LibraryService>,
) -> Result<TagIndex, String> {
    library_service.save_tag(payload).await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn delete_tag(
    payload: DeleteTagPayload,
    library_service: State<'_, LibraryService>,
) -> Result<TagIndex, String> {
    library_service.delete_tag(payload).await.map_err(|err| err.to_string())
}

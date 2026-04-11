use tauri::State;

use crate::{
    errors::{CommandResult, IntoCommandResult},
    models::tag::{
        DeleteTagGroupPayload, DeleteTagPayload, SaveTagGroupPayload,
        SaveTagPayload, TagIndex,
    },
    services::TagService,
};

#[tauri::command]
pub async fn load_tag_index(
    tag_service: State<'_, TagService>,
) -> CommandResult<TagIndex> {
    tag_service.load_tag_index().await.into_command()
}

#[tauri::command]
pub async fn save_tag_group(
    payload: SaveTagGroupPayload,
    tag_service: State<'_, TagService>,
) -> CommandResult<TagIndex> {
    tag_service.save_tag_group(payload).await.into_command()
}

#[tauri::command]
pub async fn delete_tag_group(
    payload: DeleteTagGroupPayload,
    tag_service: State<'_, TagService>,
) -> CommandResult<TagIndex> {
    tag_service.delete_tag_group(payload).await.into_command()
}

#[tauri::command]
pub async fn save_tag(
    payload: SaveTagPayload,
    tag_service: State<'_, TagService>,
) -> CommandResult<TagIndex> {
    tag_service.save_tag(payload).await.into_command()
}

#[tauri::command]
pub async fn delete_tag(
    payload: DeleteTagPayload,
    tag_service: State<'_, TagService>,
) -> CommandResult<TagIndex> {
    tag_service.delete_tag(payload).await.into_command()
}

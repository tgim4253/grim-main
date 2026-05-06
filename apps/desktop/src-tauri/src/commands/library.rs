use tauri::State;

use crate::{
    errors::{CommandResult, IntoCommandResult},
    models::library::{ExplorerSnapshot, LibrarySnapshot},
    services::LibraryService,
};

#[tauri::command]
pub async fn load_library_snapshot(
    library_service: State<'_, LibraryService>,
) -> CommandResult<LibrarySnapshot> {
    library_service.load_library_snapshot().await.into_command()
}

#[tauri::command]
pub async fn load_explorer_snapshot(
    library_service: State<'_, LibraryService>,
) -> CommandResult<ExplorerSnapshot> {
    library_service.load_explorer_snapshot().await.into_command()
}

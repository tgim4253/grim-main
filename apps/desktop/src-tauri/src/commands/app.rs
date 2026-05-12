use tauri::State;

use crate::{
    errors::{CommandResult, IntoCommandResult},
    models::app::{AppStartupState, CompleteInitialLaunchPayload},
    services::AppService,
};

#[tauri::command]
pub async fn load_app_startup_state(
    app_service: State<'_, AppService>,
) -> CommandResult<AppStartupState> {
    app_service.load_startup_state().await.into_command()
}

#[tauri::command]
pub async fn complete_initial_launch(
    payload: CompleteInitialLaunchPayload,
    app_service: State<'_, AppService>,
) -> CommandResult<()> {
    app_service.complete_initial_launch(payload).await.into_command()
}

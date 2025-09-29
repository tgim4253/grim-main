use crate::{
    models::{graph::GraphResponse, panel_settings::PanelPreferences},
    services::graph_service,
};
use anyhow::Result;

#[tauri::command]
/// Retrieve a graph for the requested node identifier.
pub async fn get_graph_one(
    _app_handle: tauri::AppHandle,
    moa_id: String,
    node_id: String,
) -> Result<GraphResponse, String> {
    let response = graph_service::get_graph_one(moa_id, node_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(response)
}

#[tauri::command]
/// Load panel view preferences for the provided workspace.
pub async fn load_panel_preferences(
    moa_id: String,
) -> Result<PanelPreferences, String> {
    graph_service::load_panel_preferences(&moa_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
/// Persist panel view preferences for the provided workspace.
pub async fn save_panel_preferences(
    moa_id: String,
    preferences: PanelPreferences,
) -> Result<(), String> {
    graph_service::save_panel_preferences(&moa_id, &preferences)
        .await
        .map_err(|error| error.to_string())
}

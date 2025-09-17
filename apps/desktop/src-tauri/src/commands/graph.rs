use crate::{models::graph::GraphResponse, services::graph_service};
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

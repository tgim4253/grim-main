use std::collections::HashSet;

use anyhow::Result;

use crate::{
    db::repository::graph_repository::GraphRepository,
    models::graph::GraphResponse, services::db::DB_MANAGER,
};

/// Fetch a neighbourhood graph for a given node within a workspace.
pub async fn get_graph_one(
    moa_id: String,
    node_id: String,
) -> Result<GraphResponse> {
    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let response =
        GraphRepository::get_graph_from_root(tx.as_mut(), node_id, None)
            .await?;

    tx.commit().await?;

    Ok(response)
}

use crate::bootstrap;
use crate::commands::moa;
use crate::config::moa::Moa;
use crate::models::node::{Node, NodeWithConnections};
use crate::services::{db, integrity, moa_services};
use anyhow::{anyhow, Context, Result};
use sqlx::{pool, Pool, Sqlite};

pub async fn bootstrap_moa_service(app_handle: tauri::AppHandle, moa_id: String) -> Result<()> {
    let moa = moa_services::MOA_DATA.read().unwrap().get_by_id(&moa_id).unwrap();

    let name = moa.name;
    let path = moa.path;

    let base = bootstrap::build_paths(&path, &name);
    if !base.exists() || !base.is_dir() {
        return Err(anyhow!("Moa Base Folder not found"));
    }

    let _ = bootstrap::ensure_layout(&base).context("Failed to prepare .moa");

    let pool = db::DB_MANAGER.get_or_open(&moa_id).await?;

    integrity::ensure_schema(&pool)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to ensure database schema: {}", e))?;

    integrity::seed_initial_data(&pool).await.context("Failed to seed initial database data")?;
    Ok(())
}

pub async fn fetch_init_data_for_front(moa_id: String) -> Result<NodeWithConnections> {
    let folders = db::fetch_folder_nodes(moa_id.clone()).await?;
    let connections =
        db::fetch_connections(moa_id.clone(), folders.iter().map(|f| f.id.clone()).collect())
            .await?;
    println!("{}", connections.len().clone().to_string());
    Ok(NodeWithConnections { nodes: folders, connections: connections })
}

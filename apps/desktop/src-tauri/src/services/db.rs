use crate::{
    bootstrap::{self, PathManager, PATH_MANAGER},
    models::{
        file::NodeFolder,
        node::{Node, NodeData, NodeRow},
    },
    services::{integrity, moa_services},
};
use anyhow::Result;
use once_cell::sync::Lazy;
use sqlx::{Pool, Sqlite};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

pub struct DbManager {
    pools: RwLock<HashMap<String, Arc<Pool<Sqlite>>>>, // key = moa_id
}
pub static DB_MANAGER: Lazy<Arc<DbManager>> = Lazy::new(|| Arc::new(DbManager::new()));
impl DbManager {
    pub fn new() -> Self {
        Self { pools: RwLock::new(HashMap::new()) }
    }

    pub async fn get_or_open(&self, moa_id: &str) -> anyhow::Result<Arc<Pool<Sqlite>>> {
        {
            let pools = self.pools.read().await;
            if let Some(pool) = pools.get(moa_id) {
                return Ok(pool.clone());
            }
        }

        let mut pools = self.pools.write().await;
        if let Some(pool) = pools.get(moa_id) {
            return Ok(pool.clone());
        }

        let path = PATH_MANAGER.get_or_add(moa_id).await?.db_path;
        let pool = Arc::new(integrity::open_or_create_db(&path).await?);
        pools.insert(moa_id.to_string(), pool.clone());

        Ok(pool)
    }
}

// Preload directory table rows for frontend using sqlx
pub async fn fetch_folder_nodes(moa_id: String) -> Result<Vec<Node>> {
    let pool = DB_MANAGER.get_or_open(&moa_id).await?;
    let mut tx: sqlx::Transaction<'static, Sqlite> = pool.begin().await?;

    let rows: Vec<NodeRow<NodeFolder>> = sqlx::query_as(
        r#"
        SELECT
            n.id                AS node_id,
            n.kind              AS kind,
            nf.id        AS folder_id,
            nf.real_folder_id   AS real_folder_id,
            nf.name             AS folder_name,
            n.created_at,
            n.updated_at
        FROM node               n
        JOIN node_folder        nf  ON nf.node_id = n.id
        WHERE n.kind = 'folder'
        ORDER BY n.created_at
        "#,
    )
    .fetch_all(&mut *tx)
    .await?;

    let mut nodes: Vec<Node> = Vec::new();

    for row in rows {
        nodes.push(Node {
            id: row.node_id.clone(),
            kind: row.kind,
            data: NodeData::Folder(row.data),
            created_at: row.created_at,
            updated_at: row.updated_at,
        });
    }

    tx.commit().await?;

    Ok(nodes)
}

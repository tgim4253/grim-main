use crate::{
    bootstrap::{self, PathManager, PATH_MANAGER},
    models::{
        connection::Connection,
        file::NodeFolder,
        node::{Node, NodeData, NodeKind, NodeRow},
    },
    services::{integrity, moa_services},
    utils::identifier::get_unique_id,
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

pub async fn fetch_connections(moa_id: String, ids: Vec<String>) -> Result<Vec<Connection>> {
    let pool = DB_MANAGER.get_or_open(&moa_id).await?;
    let mut tx = pool.begin().await?;

    let connections: Vec<Connection> = sqlx::query_as(
        r#"
        SELECT
            c.id,
            c.src_node_id,
            c.dst_node_id,
            c.kind_id AS kind_rule_id,
            ckr.kind,
            ckr.default_weight AS weight
        FROM connection c
        JOIN connection_kind_rule ckr ON c.kind_id = ckr.id
        WHERE c.src_node_id IN (SELECT value FROM json_each(?1))
        "#,
    )
    .bind(serde_json::to_string(&ids)?)
    .fetch_all(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(connections)
}

// Preload directory table rows for frontend using sqlx
pub async fn fetch_folder_nodes(moa_id: String) -> Result<Vec<Node>> {
    let pool = DB_MANAGER.get_or_open(&moa_id).await?;
    let mut tx: sqlx::Transaction<'static, Sqlite> = pool.begin().await?;

    let rows: Vec<NodeRow<NodeFolder>> = sqlx::query_as(
        r#"
        SELECT
            n.id          AS node_id,
            n.kind        AS kind,
            nf.id         AS folder_id,
            nf.display_name       AS folder_name,
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

pub async fn create_folder_node(moa_id: String, name: String, parent_id: String) -> Result<Node> {
    let pool = DB_MANAGER.get_or_open(&moa_id).await?;
    let mut tx = pool.begin().await?;

    let node_id = get_unique_id();
    let folder_id = get_unique_id();
    let now = crate::utils::date::get_now_date();

    sqlx::query(
        r#"
        INSERT INTO node (id, kind, created_at, updated_at)
        VALUES (?1, 'folder', ?2, ?2)
        "#,
    )
    .bind(&node_id)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO node_folder (id, node_id, display_name, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?4)
        "#,
    )
    .bind(&folder_id)
    .bind(&node_id)
    .bind(&name)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    // parent -> child (contains)
    let contains_id = get_unique_id();
    sqlx::query(
        r#"
        INSERT INTO connection (id, src_node_id, dst_node_id, kind_id, created_at)
        VALUES (?1, ?2, ?3, (SELECT id FROM connection_kind_rule WHERE kind = 'contains'), ?4)
        "#,
    )
    .bind(&contains_id)
    .bind(&parent_id)
    .bind(&node_id)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    // OPTIONAL: child -> parent (containedIn). Keep only if you seeded this rule.
    let contained_in_id = get_unique_id();
    sqlx::query(
        r#"
        INSERT INTO connection (id, src_node_id, dst_node_id, kind_id, created_at)
        VALUES (?1, ?2, ?3, (SELECT id FROM connection_kind_rule WHERE kind = 'containedIn'), ?4)
        "#,
    )
    .bind(&contained_in_id)
    .bind(&node_id)
    .bind(&parent_id)
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Node {
        id: node_id.clone(),
        kind: NodeKind::Folder,
        data: NodeData::Folder(NodeFolder {
            folder_id,
            node_id: node_id.clone(),
            folder_name: Some(name),
            // real_folder_id: None,   // <-- 제거
        }),
        created_at: Some(now.clone()),
        updated_at: Some(now),
    })
}

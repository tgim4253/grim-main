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

pub async fn create_virtual_folder(
    moa_id: String,
    name: String,
    parent_id: String,
) -> Result<Node> {
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

    //  child -> parent (containedIn)
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
        }),
        created_at: Some(now.clone()),
        updated_at: Some(now),
    })
}

// ensure_storage_root_and_real_folder.rs

pub async fn ensure_storage_root_and_real_folder(
    moa_id: String,
    sroot_info: &crate::models::file::StorageRootInfo,
    norm_path: &std::path::PathBuf,
) -> Result<String> {
    let pool = DB_MANAGER.get_or_open(&moa_id).await?;
    let mut tx = pool.begin().await?;

    // 1. Ensure StorageRoot exists or create it
    let sroot_id = {
        let existing_sroot_id: Option<String> = sqlx::query_scalar(
            r#"
            SELECT id FROM storage_root
            WHERE platform = ?1 AND stable_id = ?2
            "#,
        )
        .bind(&sroot_info.platform)
        .bind(&sroot_info.stable_id)
        .fetch_optional(&mut *tx)
        .await?;

        if let Some(id) = existing_sroot_id {
            // Update existing storage root
            sqlx::query(
                r#"
                UPDATE storage_root SET
                    secondary_id = ?1,
                    kind = ?2,
                    label = ?3,
                    is_available = ?4,
                    updated_at = ?5
                WHERE id = ?6
                "#,
            )
            .bind(&sroot_info.secondary_id)
            .bind(&sroot_info.kind)
            .bind(&sroot_info.label)
            .bind(sroot_info.is_available)
            .bind(&sroot_info.updated_at)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
            id
        } else {
            // Create new storage root
            let new_id = get_unique_id();
            sqlx::query(
                r#"
                INSERT INTO storage_root
                    (id, platform, stable_id, secondary_id, kind, label, is_available, created_at, updated_at)
                VALUES
                    (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                "#,
            )
            .bind(&new_id)
            .bind(&sroot_info.platform)
            .bind(&sroot_info.stable_id)
            .bind(&sroot_info.secondary_id)
            .bind(&sroot_info.kind)
            .bind(&sroot_info.label)
            .bind(sroot_info.is_available)
            .bind(&sroot_info.created_at)
            .bind(&sroot_info.updated_at)
            .execute(&mut *tx)
            .await?;
            new_id
        }
    };

    // 2. Ensure StorageRootMount exists or create/update it
    let _sroot_mount_id = {
        let existing_mount_id: Option<String> = sqlx::query_scalar(
            r#"
            SELECT id FROM storage_root_mount
            WHERE storage_root_id = ?1 AND mount_path = ?2
            "#,
        )
        .bind(&sroot_id)
        .bind(&sroot_info.mount_path)
        .fetch_optional(&mut *tx)
        .await?;

        if let Some(id) = existing_mount_id {
            sqlx::query(
                r#"
                UPDATE storage_root_mount SET
                    updated_at = ?1
                WHERE id = ?2
                "#,
            )
            .bind(&sroot_info.updated_at)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
            id
        } else {
            let new_id = get_unique_id();
            sqlx::query(
                r#"
                INSERT INTO storage_root_mount
                    (id, storage_root_id, mount_path, created_at, updated_at)
                VALUES
                    (?1, ?2, ?3, ?4, ?5)
                "#,
            )
            .bind(&new_id)
            .bind(&sroot_id)
            .bind(&sroot_info.mount_path)
            .bind(&sroot_info.created_at)
            .bind(&sroot_info.updated_at)
            .execute(&mut *tx)
            .await?;
            new_id
        }
    };

    // 3. Traverse path components and ensure real_folder entries
    let mut current_parent_id: Option<String> = None;

    // safer handling: strip_prefix 가 실패하면 빈 PathBuf 사용
    let components_path = if let Ok(sub_path) = norm_path.strip_prefix(&sroot_info.mount_path) {
        sub_path
    } else {
        norm_path
    };

    for component in components_path
        .components()
        .filter_map(|c| c.as_os_str().to_str())
        .filter(|s| !s.is_empty())
    {
        let name_norm = component.to_lowercase();
        let now = crate::utils::date::get_now_date();

        let existing_folder_id: Option<String> = sqlx::query_scalar(
            r#"
            SELECT id FROM real_folder
            WHERE storage_root_id = ?1 AND parent_id IS ?2 AND name_norm = ?3
            "#,
        )
        .bind(&sroot_id)
        .bind(&current_parent_id)
        .bind(&name_norm)
        .fetch_optional(&mut *tx)
        .await?;

        if let Some(id) = existing_folder_id {
            sqlx::query(
                r#"
                UPDATE real_folder SET
                    updated_at = ?1
                WHERE id = ?2
                "#,
            )
            .bind(&now)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
            current_parent_id = Some(id);
        } else {
            let new_id = get_unique_id();
            sqlx::query(
                r#"
                INSERT INTO real_folder
                    (id, storage_root_id, parent_id, name, name_norm, created_at, updated_at, error_flag)
                VALUES
                    (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'Success')
                "#,
            )
            .bind(&new_id)
            .bind(&sroot_id)
            .bind(&current_parent_id)
            .bind(component)
            .bind(&name_norm)
            .bind(&now)
            .bind(&now)
            .execute(&mut *tx)
            .await?;
            current_parent_id = Some(new_id);
        }
    }

    tx.commit().await?;
    current_parent_id.context("Failed to get real_folder_id for the path")
}

use crate::{
    bootstrap::{self, PathManager, PATH_MANAGER},
    config::file::MatchStates,
    models::{
        connection::Connection,
        file::{FileContent, FileInfo, NodeFolder},
        node::{Node, NodeData, NodeKind, NodeRow},
    },
    services::{integrity, moa_services},
    utils::{file_utils::normailze_file_name, identifier::get_unique_id},
};
use anyhow::{anyhow, Error, Result};
use once_cell::sync::Lazy;
use sqlx::{Executor, Pool, Sqlite, Transaction};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Arc,
};
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

    pub async fn create_new_tx(&self, moa_id: &str) -> anyhow::Result<Transaction<'_, Sqlite>> {
        let pool = self.get_or_open(moa_id).await?;
        Ok(pool.begin().await?)
    }
}

pub async fn fetch_connections<'a, E>(executor: &mut E, ids: Vec<String>) -> Result<Vec<Connection>>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
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
    .fetch_all(&mut *executor)
    .await?;

    Ok(connections)
}

// Preload directory table rows for frontend using sqlx
pub async fn fetch_folder_nodes<'a, E>(executor: &mut E) -> Result<Vec<Node>>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
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
    .fetch_all(&mut *executor)
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

    Ok(nodes)
}

pub async fn fetch_file_nodes<'a, E>(executor: &mut E) -> Result<Vec<Node>>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
    let rows: Vec<NodeRow<FileContent>> = sqlx::query_as(
        r#"
        SELECT
            n.id          AS node_id,
            n.kind        AS kind,
            fc.id         AS file_id,
            fc.mime       AS mime,
            fc.size       AS size,
            fc.sha256     AS sha256,
            fc.display_name  AS file_name,
            n.created_at,
            n.updated_at
        FROM node               n
        JOIN node_file_binding  nfb ON nfb.node_id = n.id
        JOIN file_content       fc  ON fc.id = nfb.file_content_id
        WHERE n.kind = 'file'
        ORDER BY n.created_at
        "#,
    )
    .fetch_all(&mut *executor)
    .await?;

    let mut nodes: Vec<Node> = Vec::new();

    for row in rows {
        nodes.push(Node {
            id: row.node_id.clone(),
            kind: row.kind,
            data: NodeData::File(row.data),
            created_at: row.created_at,
            updated_at: row.updated_at,
        });
    }

    Ok(nodes)
}

// Preload directory table rows for frontend using sqlx
pub async fn fetch_nodes<'a, E>(executor: &mut E, kinds: HashSet<NodeKind>) -> Result<Vec<Node>>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
    let mut rows = Vec::new();

    for kind in kinds {
        match kind {
            NodeKind::Folder => {
                rows.extend(fetch_folder_nodes(executor).await?);
            }
            NodeKind::File => {
                rows.extend(fetch_file_nodes(executor).await?);
            }
            _ => {}
        }
    }
    Ok(rows)
}

pub async fn create_virtual_folder<'a, E>(
    executor: &mut E,
    name: String,
    parent_id: String,
) -> Result<Node>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
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
    .execute(&mut *executor)
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
    .execute(&mut *executor)
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
    .execute(&mut *executor)
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
    .execute(&mut *executor)
    .await?;

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

pub async fn create_virtual_folder_mount<'a, E>(
    executor: &mut E,
    virtual_node_id: String,
    real_folder_id: String,
) -> Result<()>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
    let mount_id = get_unique_id();
    let now = crate::utils::date::get_now_date();

    // todo: enable, priority, recursive setting from front
    sqlx::query(
        r#"
        INSERT INTO virtual_folder_mount
            (id, virtual_node_id, real_folder_id, created_at, enabled, priority, recursive)
        VALUES
            (?1, ?2, ?3, ?4, 1, 0, 1)
        "#,
    )
    .bind(&mount_id)
    .bind(&virtual_node_id)
    .bind(&real_folder_id)
    .bind(&now)
    .execute(&mut *executor)
    .await?;

    Ok(())
}

pub async fn ensure_storage_root_and_real_folder<'a, E>(
    executor: &mut E,
    sroot_info: &crate::models::file::StorageRootInfo,
    norm_path: &std::path::PathBuf,
) -> Result<String>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
    // Ensure StorageRoot exists or create it
    let sroot_id = ensure_storage_root(executor, sroot_info).await?;

    // Ensure RealFolder exists or create it
    let real_folder_id = ensure_real_folder(executor, sroot_id.clone(), norm_path).await?;

    Ok(real_folder_id)
}

pub async fn ensure_storage_root<'a, E>(
    executor: &mut E,
    sroot_info: &crate::models::file::StorageRootInfo,
) -> Result<String>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
    // Ensure StorageRoot exists or create it
    let sroot_id = {
        let existing_sroot_id: Option<String> = sqlx::query_scalar(
            r#"
            SELECT id FROM storage_root
            WHERE platform = ?1 AND stable_id = ?2
            "#,
        )
        .bind(&sroot_info.platform)
        .bind(&sroot_info.stable_id)
        .fetch_optional(&mut *executor)
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
            .execute(&mut *executor)
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
            .execute(&mut *executor)
            .await?;
            new_id
        }
    };

    // Ensure StorageRootMount exists or create/update it
    let _sroot_mount_id = {
        let existing_mount_id: Option<String> = sqlx::query_scalar(
            r#"
            SELECT id FROM storage_root_mount
            WHERE storage_root_id = ?1 AND mount_path = ?2
            "#,
        )
        .bind(&sroot_id)
        .bind(&sroot_info.mount_path)
        .fetch_optional(&mut *executor)
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
            .execute(&mut *executor)
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
            .execute(&mut *executor)
            .await?;
            new_id
        }
    };

    Ok(sroot_id)
}

pub async fn ensure_real_folder<'a, E>(
    executor: &mut E,
    sroot_id: String,
    norm_path: &std::path::PathBuf,
) -> Result<String>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
    let mut current_parent_id: Option<String> = None;
    let mount_path: String = sqlx::query_scalar(
        r#"
        SELECT mount_path FROM storage_root_mount
        WHERE storage_root_id = ?1
        "#,
    )
    .bind(&sroot_id)
    .fetch_optional(&mut *executor)
    .await?
    .unwrap();

    let components_path =
        if let Ok(sub_path) = norm_path.strip_prefix(&mount_path) { sub_path } else { norm_path };

    let components: Vec<&str> = if components_path.as_os_str().is_empty() {
        vec![""]
    } else {
        components_path
            .components()
            .filter_map(|c| c.as_os_str().to_str())
            .filter(|s| !s.is_empty())
            .collect()
    };

    let mut rel_path = PathBuf::from("");
    let mut abs_path = PathBuf::from(&mount_path);
    for component in components {
        abs_path.push(component);
        rel_path.push(component);

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
        .fetch_optional(&mut *executor)
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
            .execute(&mut *executor)
            .await?;
            current_parent_id = Some(id);
        } else {
            let new_id = get_unique_id();
            sqlx::query(
                r#"
                INSERT INTO real_folder
                    (id, storage_root_id, parent_id, name, name_norm, created_at, updated_at, error_flag, abs_path_cached, root_rel_path)
                VALUES
                    (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'success', ?8, ?9)
                "#,
            )
            .bind(&new_id)
            .bind(&sroot_id)
            .bind(&current_parent_id)
            .bind(component)
            .bind(&name_norm)
            .bind(&now)
            .bind(&now)
            .bind(&abs_path.to_string_lossy().to_string())
            .bind(&rel_path.to_string_lossy().to_string())
            .execute(&mut *executor)
            .await?;
            current_parent_id = Some(new_id);
        }
    }

    if let Some(id) = current_parent_id {
        Ok(id)
    } else {
        Err(anyhow::anyhow!("Failed to create or find real_folder ID"))
    }
}

/// return file_path_id
pub async fn create_file_path<'a, E>(executor: &mut E, file_info: &FileInfo) -> Result<String>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
    let file_path_id = get_unique_id();
    let now = crate::utils::date::get_now_date();

    let file_path_id: String = sqlx::query_scalar(
        r#"
        INSERT INTO file_path
            (id, folder_id, file_name, file_name_norm, mtime, is_found, last_seen_at)
        VALUES
            (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(folder_id, file_name_norm) DO UPDATE SET
            file_name    = excluded.file_name,
            mtime        = excluded.mtime,
            is_found   = excluded.is_found,
            last_seen_at = ?7
        RETURNING id
        "#,
    )
    .bind(&file_path_id)
    .bind(&file_info.real_folder_id)
    .bind(&file_info.file_name)
    .bind(&file_info.file_name_norm)
    .bind(&file_info.file_mtime)
    .bind(&file_info.file_exists)
    .bind(&now)
    .fetch_one(&mut *executor)
    .await
    .map_err(|e| anyhow!(format!("Failed to insert or update file_path: {}", e)))?;

    Ok(file_path_id)
}

pub async fn resolve_and_upsert_file_content<'a, E>(
    executor: &mut E,
    file_info: &FileInfo,
) -> Result<String>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
    let now = crate::utils::date::get_now_date();

    let size = file_info
        .file_size
        .ok_or_else(|| anyhow!("file_size must be provided when file_exists=true"))?;

    // Check if file_content exists by xxh3_64
    let file_content_id: Option<String> =
        sqlx::query_scalar("SELECT id FROM file_content WHERE xxh3_64 = ?1")
            .bind(&file_info.xxh3_64)
            .fetch_optional(&mut *executor)
            .await?;

    let file_content_id = if let Some(id) = file_content_id {
        // Update existing file_content (e.g., mime, size if they changed)
        sqlx::query(
            r#"
            UPDATE file_content SET
                mime = ?1,
                size = ?2,
                kind = ?3,
                updated_at = ?4
            WHERE id = ?5
            "#,
        )
        .bind(&file_info.mime_guess)
        .bind(size)
        .bind(file_info.kind_guess)
        .bind(&now)
        .bind(&id)
        .execute(&mut *executor)
        .await?;
        id
    } else {
        // Create new file_content
        let new_id = get_unique_id();
        sqlx::query(
            r#"
            INSERT INTO file_content
                (id, mime, size, xxh3_64, kind, display_name, created_at, updated_at)
            VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
        )
        .bind(&new_id)
        .bind(&file_info.mime_guess)
        .bind(file_info.file_size)
        .bind(&file_info.xxh3_64)
        .bind(file_info.kind_guess)
        .bind(&file_info.file_name)
        .bind(&now)
        .bind(&now)
        .execute(&mut *executor)
        .await?;
        new_id
    };

    Ok(file_content_id)
}

pub async fn bind_file_content_to_file_path<'a, E>(
    executor: &mut E,
    file_path_id: &str,
    file_content_id: &str,
) -> Result<String>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
    let now = crate::utils::date::get_now_date();
    let new_id = get_unique_id();

    let binding_id: String = sqlx::query_scalar(
        r#"
        INSERT INTO file_path_content_binding
            (id, file_path_id, file_content_id, match_states, is_active, created_at, updated_at)
        VALUES
            (?1, ?2, ?3, ?4, 1, ?5, ?6)
        ON CONFLICT(file_path_id, file_content_id) DO UPDATE SET
            match_states = excluded.match_states,
            is_active = 1,
            updated_at   = excluded.updated_at
        RETURNING id
    "#,
    )
    .bind(new_id)
    .bind(file_path_id)
    .bind(&file_content_id)
    .bind(MatchStates::Match)
    .bind(&now)
    .bind(&now)
    .fetch_one(&mut *executor)
    .await
    .map_err(|e| anyhow!(format!("Failed to bind file_path: {}", e)))?;

    // set all other mount paths of this binding match_states=unknown
    sqlx::query(
        r#"
            UPDATE file_path_content_binding
               SET match_states = CASE WHEN id = ?1 THEN 'match' ELSE 'unknown' END,
                   updated_at = ?2
             WHERE file_path_id = ?3
            "#,
    )
    .bind(&binding_id)
    .bind(&now)
    .bind(file_path_id)
    .execute(&mut *executor)
    .await?;

    Ok(binding_id)
}

pub async fn create_file_node<'a, E>(
    executor: &mut E,
    parent_node_id: &str,
    file_content_id: &str,
) -> Result<()>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
    let node_id = get_unique_id();
    let binding_id = get_unique_id();
    let now = crate::utils::date::get_now_date();

    sqlx::query(
        r#"
        INSERT INTO node (id, kind, created_at, updated_at)
        VALUES (?1, 'file', ?2, ?2)
        "#,
    )
    .bind(&node_id)
    .bind(&now)
    .execute(&mut *executor)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO node_file_binding (id, node_id, file_content_id, created_at)
        VALUES (?1, ?2, ?3, ?4)
        "#,
    )
    .bind(&binding_id)
    .bind(&node_id)
    .bind(&file_content_id)
    .bind(&now)
    .execute(&mut *executor)
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
    .bind(&parent_node_id)
    .bind(&node_id)
    .bind(&now)
    .execute(&mut *executor)
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
    .bind(&parent_node_id)
    .bind(&now)
    .execute(&mut *executor)
    .await?;

    Ok(())
}

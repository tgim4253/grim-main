use std::collections::HashMap;

use anyhow::Result;
use sqlx::Row;

use crate::{
    models::library::{
        DeleteVirtualFolderPayload, SaveVirtualFolderPayload,
        SaveVirtualFolderResult, VirtualFolder,
    },
    utils::{date::get_now_date, identifier::get_unique_id},
};

use super::{mappers::folder_from_row, runtime::pool};

pub async fn load_virtual_folders() -> Result<Vec<VirtualFolder>> {
    let pool = pool()?;
    let rows = sqlx::query(
        r#"
        SELECT id, parent_id, name, full_path, alias, sort_order, created_at, updated_at
        FROM virtual_folder
        ORDER BY full_path ASC, sort_order ASC, name ASC
        "#,
    )
    .fetch_all(&pool)
    .await?;

    rows.into_iter().map(folder_from_row).collect()
}

pub async fn search_virtual_folders(query: &str) -> Result<Vec<VirtualFolder>> {
    let pool = pool()?;
    let pattern = format!("%{}%", query.trim());
    let rows = sqlx::query(
        r#"
        SELECT id, parent_id, name, full_path, alias, sort_order, created_at, updated_at
        FROM virtual_folder
        WHERE name LIKE ?1 OR full_path LIKE ?1 OR COALESCE(alias, '') LIKE ?1
        ORDER BY full_path ASC
        "#,
    )
    .bind(pattern)
    .fetch_all(&pool)
    .await?;

    rows.into_iter().map(folder_from_row).collect()
}

pub async fn save_virtual_folder(
    payload: SaveVirtualFolderPayload,
) -> Result<SaveVirtualFolderResult> {
    let pool = pool()?;
    let now = get_now_date();
    let mut tx = pool.begin().await?;
    let saved_folder_id = payload.id.clone().unwrap_or_else(get_unique_id);

    match payload.id.as_deref() {
        Some(folder_id) => {
            sqlx::query(
                r#"
                UPDATE virtual_folder
                SET name = ?2, parent_id = ?3, alias = ?4, updated_at = ?5
                WHERE id = ?1
                "#,
            )
            .bind(folder_id)
            .bind(&payload.name)
            .bind(payload.parent_id.as_deref())
            .bind(payload.alias.as_deref())
            .bind(&now)
            .execute(&mut *tx)
            .await?;
        }
        None => {
            sqlx::query(
                r#"
                INSERT INTO virtual_folder
                (id, name, parent_id, full_path, alias, sort_order, created_at, updated_at)
                VALUES (?1, ?2, ?3, '', ?4, 0, ?5, ?5)
                "#,
            )
            .bind(&saved_folder_id)
            .bind(&payload.name)
            .bind(payload.parent_id.as_deref())
            .bind(payload.alias.as_deref())
            .bind(&now)
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;
    rebuild_folder_paths().await?;
    Ok(SaveVirtualFolderResult {
        saved_folder_id,
        folders: load_virtual_folders().await?,
    })
}

pub async fn delete_virtual_folder(
    payload: DeleteVirtualFolderPayload,
) -> Result<Vec<VirtualFolder>> {
    let pool = pool()?;
    sqlx::query("DELETE FROM virtual_folder WHERE id = ?1")
        .bind(&payload.folder_id)
        .execute(&pool)
        .await?;
    rebuild_folder_paths().await?;
    load_virtual_folders().await
}

async fn rebuild_folder_paths() -> Result<()> {
    #[derive(Clone)]
    struct FolderNode {
        id: String,
        parent_id: Option<String>,
        name: String,
        full_path: String,
        sort_order: i64,
    }

    let pool = pool()?;
    let rows = sqlx::query(
        "SELECT id, parent_id, name, full_path, sort_order FROM virtual_folder",
    )
    .fetch_all(&pool)
    .await?;

    let mut nodes = HashMap::new();
    let mut children: HashMap<Option<String>, Vec<String>> = HashMap::new();
    for row in rows {
        let node = FolderNode {
            id: row.try_get("id")?,
            parent_id: row.try_get("parent_id")?,
            name: row.try_get("name")?,
            full_path: row.try_get("full_path")?,
            sort_order: row.try_get("sort_order")?,
        };
        children
            .entry(node.parent_id.clone())
            .or_default()
            .push(node.id.clone());
        nodes.insert(node.id.clone(), node);
    }

    for ids in children.values_mut() {
        ids.sort_by(|left, right| {
            let left_node = nodes.get(left).expect("missing left node");
            let right_node = nodes.get(right).expect("missing right node");
            left_node
                .sort_order
                .cmp(&right_node.sort_order)
                .then_with(|| left_node.name.cmp(&right_node.name))
        });
    }

    let mut stack: Vec<(String, String)> = children
        .get(&None)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .rev()
        .map(|id| {
            let node = nodes.get(&id).expect("root node missing");
            (id, format!("/{}", node.name))
        })
        .collect();

    while let Some((node_id, next_path)) = stack.pop() {
        let Some(node) = nodes.get_mut(&node_id) else {
            continue;
        };
        node.full_path = next_path.clone();

        if let Some(child_ids) = children.get(&Some(node_id.clone())) {
            for child_id in child_ids.iter().rev() {
                if let Some(child) = nodes.get(child_id) {
                    stack.push((
                        child_id.clone(),
                        format!("{}/{}", next_path, child.name),
                    ));
                }
            }
        }
    }

    let mut tx = pool.begin().await?;
    for node in nodes.values() {
        sqlx::query("UPDATE virtual_folder SET full_path = ?2 WHERE id = ?1")
            .bind(&node.id)
            .bind(&node.full_path)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;

    Ok(())
}

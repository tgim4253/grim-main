use std::collections::HashMap;

use anyhow::Result;
use sqlx::SqlitePool;

use crate::{
    models::folder::{SaveVirtualFolderPayload, VirtualFolder},
    utils::{date::get_now_date, identifier::get_unique_id},
};

use super::mappers::{folder_from_row, VirtualFolderRow};

#[derive(Clone)]
pub struct FolderRepository {
    pool: SqlitePool,
}

impl FolderRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn load_all(&self) -> Result<Vec<VirtualFolder>> {
        let rows = sqlx::query_as!(
            VirtualFolderRow,
            r#"
            SELECT id, parent_id, name, full_path, alias, sort_order, created_at, updated_at
            FROM virtual_folder
            ORDER BY full_path ASC, sort_order ASC, name ASC
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(folder_from_row).collect())
    }

    pub async fn search(&self, query: &str) -> Result<Vec<VirtualFolder>> {
        let pattern = format!("%{}%", query.trim());
        let rows = sqlx::query_as!(
            VirtualFolderRow,
            r#"
            SELECT id, parent_id, name, full_path, alias, sort_order, created_at, updated_at
            FROM virtual_folder
            WHERE name LIKE ?1 OR full_path LIKE ?1 OR COALESCE(alias, '') LIKE ?1
            ORDER BY full_path ASC
            "#,
            pattern
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(folder_from_row).collect())
    }

    pub async fn save(
        &self,
        payload: SaveVirtualFolderPayload,
    ) -> Result<String> {
        let now = get_now_date();
        let now_ref = now.as_str();
        let folder_name = payload.name.as_str();
        let parent_id = payload.parent_id.as_deref();
        let alias = payload.alias.as_deref();
        let mut tx = self.pool.begin().await?;
        let saved_folder_id = payload.id.clone().unwrap_or_else(get_unique_id);
        let saved_folder_id_ref = saved_folder_id.as_str();

        match payload.id.as_deref() {
            Some(folder_id) => {
                sqlx::query!(
                    r#"
                    UPDATE virtual_folder
                    SET name = ?2, parent_id = ?3, alias = ?4, updated_at = ?5
                    WHERE id = ?1
                    "#,
                    folder_id,
                    folder_name,
                    parent_id,
                    alias,
                    now_ref
                )
                .execute(&mut *tx)
                .await?;
            }
            None => {
                sqlx::query!(
                    r#"
                    INSERT INTO virtual_folder
                    (id, name, parent_id, full_path, alias, sort_order, created_at, updated_at)
                    VALUES (?1, ?2, ?3, '', ?4, 0, ?5, ?5)
                    "#,
                    saved_folder_id_ref,
                    folder_name,
                    parent_id,
                    alias,
                    now_ref
                )
                .execute(&mut *tx)
                .await?;
            }
        }

        tx.commit().await?;
        self.rebuild_paths().await?;
        Ok(saved_folder_id)
    }

    pub async fn delete(&self, folder_id: &str) -> Result<()> {
        sqlx::query!("DELETE FROM virtual_folder WHERE id = ?1", folder_id)
            .execute(&self.pool)
            .await?;
        self.rebuild_paths().await?;
        Ok(())
    }

    async fn rebuild_paths(&self) -> Result<()> {
        #[derive(Clone)]
        struct FolderNode {
            id: String,
            parent_id: Option<String>,
            name: String,
            full_path: String,
            sort_order: i64,
        }

        let rows = sqlx::query!(
            "SELECT id, parent_id, name, full_path, sort_order FROM virtual_folder",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut nodes = HashMap::new();
        let mut children: HashMap<Option<String>, Vec<String>> = HashMap::new();
        for row in rows {
            let node = FolderNode {
                id: row.id,
                parent_id: row.parent_id,
                name: row.name,
                full_path: row.full_path,
                sort_order: row.sort_order,
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

        let mut tx = self.pool.begin().await?;
        for node in nodes.values() {
            let node_id = node.id.as_str();
            let full_path = node.full_path.as_str();
            sqlx::query!(
                "UPDATE virtual_folder SET full_path = ?2 WHERE id = ?1",
                node_id,
                full_path
            )
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;

        Ok(())
    }
}

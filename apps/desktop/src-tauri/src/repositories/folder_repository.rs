use std::collections::{HashMap, HashSet};

use anyhow::{anyhow, Result};
use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::{
    models::{
        folder::{
            SaveVirtualFolderPayload, VirtualFolder, VirtualFolderKind,
            SYSTEM_UNCATEGORIZED_FOLDER_NAME,
        },
        library::FolderStats,
    },
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
            SELECT id, parent_id, name, full_path, alias, kind, sort_order, created_at, updated_at
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
            SELECT id, parent_id, name, full_path, alias, kind, sort_order, created_at, updated_at
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

    pub async fn load_by_id(
        &self,
        folder_id: &str,
    ) -> Result<Option<VirtualFolder>> {
        let row = sqlx::query_as!(
            VirtualFolderRow,
            r#"
            SELECT id, parent_id, name, full_path, alias, kind, sort_order, created_at, updated_at
            FROM virtual_folder
            WHERE id = ?1
            "#,
            folder_id
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(row.map(folder_from_row))
    }

    pub async fn save(
        &self,
        payload: SaveVirtualFolderPayload,
    ) -> Result<String> {
        let mut tx = self.pool.begin().await?;
        let saved_folder_id =
            self.save_with_parent_policy_in_tx(&mut tx, payload).await?;
        self.rebuild_paths_in_tx(&mut tx).await?;
        tx.commit().await?;
        Ok(saved_folder_id)
    }

    async fn save_with_parent_policy_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        payload: SaveVirtualFolderPayload,
    ) -> Result<String> {
        let now = get_now_date();
        let now_ref = now.as_str();
        let folder_name = payload.name.trim();
        if folder_name.is_empty() {
            return Err(anyhow!("Folder name is required"));
        }
        let parent_id = payload.parent_id.as_deref();
        if folder_name.eq_ignore_ascii_case(SYSTEM_UNCATEGORIZED_FOLDER_NAME)
            && parent_id.is_some()
        {
            return Err(anyhow!(
                "Uncategorized is reserved under parent folders"
            ));
        }

        let saved_folder_id = payload.id.clone().unwrap_or_else(get_unique_id);
        let saved_folder_id_ref = saved_folder_id.as_str();

        if let Some(parent_id) = parent_id {
            self.validate_parent_can_contain_child_in_tx(tx, parent_id).await?;
        }

        let old_parent_id: Option<String> = match payload.id.as_deref() {
            Some(folder_id) => {
                let existing = sqlx::query!(
                    "SELECT parent_id, kind FROM virtual_folder WHERE id = ?1",
                    folder_id
                )
                .fetch_optional(&mut **tx)
                .await?
                .ok_or_else(|| anyhow!("Folder not found"))?;

                if existing.kind
                    == VirtualFolderKind::SystemUncategorized.as_str()
                {
                    return Err(anyhow!(
                        "System folders cannot be renamed or moved"
                    ));
                }
                if parent_id == Some(folder_id) {
                    return Err(anyhow!("A folder cannot be its own parent"));
                }
                if let Some(parent_id) = parent_id {
                    self.ensure_parent_is_not_descendant_in_tx(
                        tx, folder_id, parent_id,
                    )
                    .await?;
                }

                existing.parent_id
            }
            None => None,
        };

        match payload.id.as_deref() {
            Some(folder_id) => {
                let alias = payload.alias.as_deref();
                let result = sqlx::query!(
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
                .execute(&mut **tx)
                .await?;
                if result.rows_affected() == 0 {
                    return Err(anyhow!("Folder not found"));
                }
            }
            None => {
                let alias = payload.alias.as_deref();
                sqlx::query!(
                    r#"
                    INSERT INTO virtual_folder
                    (id, name, parent_id, full_path, alias, kind, sort_order, created_at, updated_at)
                    VALUES (?1, ?2, ?3, '', ?4, 'user', 0, ?5, ?5)
                    "#,
                    saved_folder_id_ref,
                    folder_name,
                    parent_id,
                    alias,
                    now_ref
                )
                .execute(&mut **tx)
                .await?;
            }
        }

        if let Some(parent_id) = parent_id {
            let uncategorized_id = self
                .ensure_system_uncategorized_child_in_tx(tx, parent_id)
                .await?;
            self.move_direct_assets_to_folder_in_tx(
                tx,
                parent_id,
                &uncategorized_id,
            )
            .await?;
        }

        if old_parent_id.as_deref() != parent_id {
            if let Some(old_parent_id) = old_parent_id.as_deref() {
                self.delete_empty_system_uncategorized_child_if_leaf_in_tx(
                    tx,
                    old_parent_id,
                )
                .await?;
            }
        }

        Ok(saved_folder_id)
    }

    async fn validate_parent_can_contain_child_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        parent_id: &str,
    ) -> Result<()> {
        let parent = sqlx::query!(
            "SELECT kind FROM virtual_folder WHERE id = ?1",
            parent_id
        )
        .fetch_optional(&mut **tx)
        .await?
        .ok_or_else(|| anyhow!("Parent folder not found"))?;

        if parent.kind == VirtualFolderKind::SystemUncategorized.as_str() {
            return Err(anyhow!("System folders cannot contain child folders"));
        }

        Ok(())
    }

    async fn ensure_parent_is_not_descendant_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        folder_id: &str,
        parent_id: &str,
    ) -> Result<()> {
        let row = sqlx::query!(
            r#"
            WITH RECURSIVE parent_chain(id, parent_id) AS (
                SELECT id, parent_id
                FROM virtual_folder
                WHERE id = ?1
                UNION ALL
                SELECT vf.id, vf.parent_id
                FROM virtual_folder vf
                INNER JOIN parent_chain pc ON vf.id = pc.parent_id
            )
            SELECT COUNT(*) AS "count!: i64"
            FROM parent_chain
            WHERE id = ?2
            "#,
            parent_id,
            folder_id
        )
        .fetch_one(&mut **tx)
        .await?;

        if row.count > 0 {
            return Err(anyhow!(
                "A folder cannot be moved under its descendant"
            ));
        }

        Ok(())
    }

    pub async fn delete(&self, folder_id: &str) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        let folder = sqlx::query!(
            "SELECT parent_id, kind FROM virtual_folder WHERE id = ?1",
            folder_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| anyhow!("Folder not found"))?;
        if folder.kind == VirtualFolderKind::SystemUncategorized.as_str() {
            return Err(anyhow!("System folders cannot be deleted"));
        }

        let child_count = sqlx::query!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM virtual_folder child
            WHERE child.parent_id = ?1
              AND (
                child.kind != 'system_uncategorized'
                OR EXISTS (
                    SELECT 1
                    FROM asset_virtual_folder avf
                    WHERE avf.virtual_folder_id = child.id
                )
              )
            "#,
            folder_id
        )
        .fetch_one(&mut *tx)
        .await?
        .count;
        if child_count > 0 {
            return Err(anyhow!("Folder with child folders cannot be deleted"));
        }

        let direct_asset_count = sqlx::query!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM asset_virtual_folder
            WHERE virtual_folder_id = ?1
            "#,
            folder_id
        )
        .fetch_one(&mut *tx)
        .await?
        .count;
        if direct_asset_count > 0 {
            return Err(anyhow!("Folder with assets cannot be deleted"));
        }

        sqlx::query!("DELETE FROM virtual_folder WHERE id = ?1", folder_id)
            .execute(&mut *tx)
            .await?;

        if let Some(parent_id) = folder.parent_id.as_deref() {
            self.delete_empty_system_uncategorized_child_if_leaf_in_tx(
                &mut tx, parent_id,
            )
            .await?;
        }

        self.rebuild_paths_in_tx(&mut tx).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn child_count(&self, folder_id: &str) -> Result<i64> {
        let row = sqlx::query!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM virtual_folder child
            WHERE child.parent_id = ?1
              AND (
                child.kind != 'system_uncategorized'
                OR EXISTS (
                    SELECT 1
                    FROM asset_virtual_folder avf
                    WHERE avf.virtual_folder_id = child.id
                )
              )
            "#,
            folder_id
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(row.count)
    }

    pub async fn validate_assignable_folders_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        virtual_folder_ids: &[String],
    ) -> Result<()> {
        for folder_id in virtual_folder_ids {
            let folder = sqlx::query!(
                r#"
                SELECT kind
                FROM virtual_folder
                WHERE id = ?1
                "#,
                folder_id
            )
            .fetch_optional(&mut **tx)
            .await?
            .ok_or_else(|| anyhow!("Folder not found"))?;

            let child_count = sqlx::query!(
                r#"
                SELECT COUNT(*) AS "count!: i64"
                FROM virtual_folder child
                WHERE child.parent_id = ?1
                  AND (
                    child.kind != 'system_uncategorized'
                    OR EXISTS (
                        SELECT 1
                        FROM asset_virtual_folder avf
                        WHERE avf.virtual_folder_id = child.id
                    )
                  )
                "#,
                folder_id
            )
            .fetch_one(&mut **tx)
            .await?
            .count;

            if child_count > 0 {
                return Err(anyhow!(
                    "Assets can only be assigned to leaf folders"
                ));
            }
            if folder.kind == VirtualFolderKind::SystemUncategorized.as_str() {
                continue;
            }
        }

        Ok(())
    }

    pub async fn direct_asset_count(&self, folder_id: &str) -> Result<i64> {
        let row = sqlx::query!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM asset_virtual_folder
            WHERE virtual_folder_id = ?1
            "#,
            folder_id
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(row.count)
    }

    pub async fn load_stats(&self) -> Result<Vec<FolderStats>> {
        let folders = self.load_all().await?;
        let assignment_rows = sqlx::query!(
            r#"
            SELECT virtual_folder_id AS "folder_id!: String",
                   asset_id AS "asset_id!: String"
            FROM asset_virtual_folder
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        let mut direct_assets: HashMap<String, HashSet<String>> =
            HashMap::new();
        for row in assignment_rows {
            direct_assets
                .entry(row.folder_id)
                .or_default()
                .insert(row.asset_id);
        }

        let mut children: HashMap<Option<String>, Vec<String>> = HashMap::new();
        let folder_kind_by_id = folders
            .iter()
            .map(|folder| (folder.id.clone(), folder.kind))
            .collect::<HashMap<_, _>>();
        for folder in &folders {
            children
                .entry(folder.parent_id.clone())
                .or_default()
                .push(folder.id.clone());
        }

        fn descendant_assets(
            folder_id: &str,
            children: &HashMap<Option<String>, Vec<String>>,
            direct_assets: &HashMap<String, HashSet<String>>,
            cache: &mut HashMap<String, HashSet<String>>,
        ) -> HashSet<String> {
            if let Some(asset_ids) = cache.get(folder_id) {
                return asset_ids.clone();
            }

            let mut asset_ids =
                direct_assets.get(folder_id).cloned().unwrap_or_default();
            for child_asset_ids in children
                .get(&Some(folder_id.to_string()))
                .into_iter()
                .flat_map(|ids| ids.iter())
                .map(|child_id| {
                    descendant_assets(child_id, children, direct_assets, cache)
                })
            {
                asset_ids.extend(child_asset_ids);
            }

            cache.insert(folder_id.to_string(), asset_ids.clone());
            asset_ids
        }

        let mut cache = HashMap::new();
        let stats = folders
            .into_iter()
            .map(|folder| {
                let direct_asset_count = direct_assets
                    .get(&folder.id)
                    .map(|ids| ids.len() as i64)
                    .unwrap_or(0);
                let child_count = children
                    .get(&Some(folder.id.clone()))
                    .map(|ids| {
                        ids.iter()
                            .filter(|child_id| {
                                folder_kind_by_id.get(*child_id).copied()
                                    != Some(
                                        VirtualFolderKind::SystemUncategorized,
                                    )
                                    || direct_assets
                                        .get(*child_id)
                                        .map(|asset_ids| !asset_ids.is_empty())
                                        .unwrap_or(false)
                            })
                            .count() as i64
                    })
                    .unwrap_or(0);
                let descendant_asset_count = descendant_assets(
                    &folder.id,
                    &children,
                    &direct_assets,
                    &mut cache,
                )
                .len() as i64;

                FolderStats {
                    folder_id: folder.id,
                    direct_asset_count,
                    descendant_asset_count,
                    child_count,
                }
            })
            .collect();

        Ok(stats)
    }

    pub async fn cleanup_empty_system_uncategorized_parents_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        folders: &[VirtualFolder],
    ) -> Result<()> {
        let mut parent_ids = HashSet::new();
        for folder in folders {
            if folder.kind == VirtualFolderKind::SystemUncategorized {
                if let Some(parent_id) = folder.parent_id.as_ref() {
                    parent_ids.insert(parent_id.clone());
                }
            }
        }

        for parent_id in parent_ids {
            self.delete_empty_system_uncategorized_child_if_leaf_in_tx(
                tx, &parent_id,
            )
            .await?;
        }

        Ok(())
    }

    async fn ensure_system_uncategorized_child_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        parent_id: &str,
    ) -> Result<String> {
        let kind = VirtualFolderKind::SystemUncategorized.as_str();
        if let Some(row) = sqlx::query!(
            r#"
            SELECT id
            FROM virtual_folder
            WHERE parent_id = ?1 AND kind = ?2
            "#,
            parent_id,
            kind
        )
        .fetch_optional(&mut **tx)
        .await?
        {
            return Ok(row.id);
        }

        let now = get_now_date();
        let now_ref = now.as_str();
        let folder_id = get_unique_id();
        let folder_name = SYSTEM_UNCATEGORIZED_FOLDER_NAME;

        sqlx::query!(
            r#"
            INSERT OR IGNORE INTO virtual_folder
            (id, name, parent_id, full_path, alias, kind, sort_order, created_at, updated_at)
            VALUES (?1, ?2, ?3, '', NULL, ?4, -1, ?5, ?5)
            "#,
            folder_id,
            folder_name,
            parent_id,
            kind,
            now_ref
        )
        .execute(&mut **tx)
        .await?;

        let row = sqlx::query!(
            r#"
            SELECT id
            FROM virtual_folder
            WHERE parent_id = ?1 AND kind = ?2
            "#,
            parent_id,
            kind
        )
        .fetch_one(&mut **tx)
        .await?;

        Ok(row.id)
    }

    async fn move_direct_assets_to_folder_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        source_folder_id: &str,
        target_folder_id: &str,
    ) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT OR IGNORE INTO asset_virtual_folder
            (asset_id, virtual_folder_id, source_type, created_at)
            SELECT asset_id, ?2, source_type, created_at
            FROM asset_virtual_folder
            WHERE virtual_folder_id = ?1
            "#,
            source_folder_id,
            target_folder_id
        )
        .execute(&mut **tx)
        .await?;
        sqlx::query!(
            "DELETE FROM asset_virtual_folder WHERE virtual_folder_id = ?1",
            source_folder_id
        )
        .execute(&mut **tx)
        .await?;

        Ok(())
    }

    async fn delete_empty_system_uncategorized_child_if_leaf_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        parent_id: &str,
    ) -> Result<()> {
        let user_child_count = sqlx::query!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM virtual_folder
            WHERE parent_id = ?1 AND kind = 'user'
            "#,
            parent_id
        )
        .fetch_one(&mut **tx)
        .await?
        .count;
        if user_child_count > 0 {
            return Ok(());
        }

        let Some(system_child) = sqlx::query!(
            r#"
            SELECT id
            FROM virtual_folder
            WHERE parent_id = ?1 AND kind = 'system_uncategorized'
            "#,
            parent_id
        )
        .fetch_optional(&mut **tx)
        .await?
        else {
            return Ok(());
        };

        let system_asset_count = sqlx::query!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM asset_virtual_folder
            WHERE virtual_folder_id = ?1
            "#,
            system_child.id
        )
        .fetch_one(&mut **tx)
        .await?
        .count;
        if system_asset_count > 0 {
            return Ok(());
        }

        sqlx::query!(
            "DELETE FROM virtual_folder WHERE id = ?1",
            system_child.id
        )
        .execute(&mut **tx)
        .await?;

        Ok(())
    }

    async fn rebuild_paths_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
    ) -> Result<()> {
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
        .fetch_all(&mut **tx)
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

        for node in nodes.values() {
            let node_id = node.id.as_str();
            let full_path = node.full_path.as_str();
            sqlx::query!(
                "UPDATE virtual_folder SET full_path = ?2 WHERE id = ?1",
                node_id,
                full_path
            )
            .execute(&mut **tx)
            .await?;
        }

        Ok(())
    }
}

use anyhow::Result;
use sqlx::{Executor, Sqlite};
use std::{collections::HashSet, str::FromStr};

use crate::{
    db::repository::connection_repository::ConnectionRepository,
    models::{
        file::{FileContent, NodeFolder},
        node::{Node, NodeData, NodeKind},
    },
    utils::identifier::get_unique_id,
};

pub struct NodeRepository;

impl NodeRepository {
    pub async fn fetch_nodes<'a, E>(executor: &mut E, kinds: HashSet<NodeKind>) -> Result<Vec<Node>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let mut rows = Vec::new();
        for kind in kinds {
            match kind {
                NodeKind::Folder => {
                    rows.extend(Self::fetch_folder_nodes(executor).await?);
                }
                NodeKind::File => {
                    rows.extend(Self::fetch_file_nodes(executor).await?);
                }
                _ => {}
            }
        }
        Ok(rows)
    }

    async fn fetch_folder_nodes<'a, E>(executor: &mut E) -> Result<Vec<Node>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        struct FolderNodeRow {
            node_id: String,
            kind: String,
            folder_id: String,
            folder_name: String,
            created_at: String,
            updated_at: String,
        }

        let rows: Vec<FolderNodeRow> = sqlx::query_as!(
            FolderNodeRow,
            r#"
                    SELECT
                        n.id          AS "node_id!",
                        n.kind        AS "kind!",
                        nf.id         AS "folder_id!",
                        nf.display_name       AS "folder_name!",
                        n.created_at AS "created_at!",
                        n.updated_at AS "updated_at!"
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
                kind: NodeKind::from_str(&row.kind)?,
                data: NodeData::Folder({
                    NodeFolder {
                        folder_id: row.folder_id,
                        node_id: row.node_id.clone(),
                        folder_name: row.folder_name,
                    }
                }),
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
        struct FileNodeRow {
            node_id: String,
            kind: String,
            file_id: String,
            mime: String,
            size: i64,
            sha256: Option<String>,
            xxh3_64: String,
            file_name: String,
            created_at: String,
            updated_at: String,
        }

        let rows: Vec<FileNodeRow> = sqlx::query_as!(
            FileNodeRow,
            r#"
            SELECT
                n.id          AS "node_id!",
                n.kind        AS "kind!",
                fc.id         AS "file_id!",
                fc.mime       AS "mime!",
                fc.size       AS "size!",
                fc.sha256     AS "sha256?",
                fc.xxh3_64     AS "xxh3_64!",
                fc.display_name  AS "file_name!",
                n.created_at AS "created_at!",
                n.updated_at AS "updated_at!"
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
                kind: NodeKind::from_str(&row.kind)?,
                data: NodeData::File(FileContent {
                    node_id: row.node_id.clone(),
                    file_id: row.file_id,
                    mime: row.mime,
                    size: row.size,
                    sha256: row.sha256,
                    xxh3_64: row.xxh3_64,
                    file_name: row.file_name,
                }),
                created_at: row.created_at,
                updated_at: row.updated_at,
            });
        }

        Ok(nodes)
    }

    pub async fn insert_node<'a, E>(executor: &mut E, kind: NodeKind, now: &str) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let node_id = get_unique_id();

        sqlx::query!(
            r#"
            INSERT INTO node (id, kind, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            "#,
            node_id,
            kind,
            now,
            now
        )
        .execute(&mut *executor)
        .await?;

        Ok(node_id)
    }

    async fn insert_node_file_binding<'a, E>(
        executor: &mut E,
        node_id: String,
        file_content_id: String,
        now: String,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let binding_id = crate::utils::identifier::get_unique_id();

        sqlx::query!(
            r#"
            INSERT INTO node_file_binding (id, node_id, file_content_id, created_at)
            VALUES (?1, ?2, ?3, ?4)
            "#,
            binding_id,
            node_id,
            file_content_id,
            now,
        )
        .execute(&mut *executor)
        .await?;

        Ok(binding_id)
    }
    pub async fn insert_node_folder_binding<'a, E>(
        executor: &mut E,
        node_id: String,
        folder_id: String,
        name: String,
        now: String,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let id = get_unique_id();

        sqlx::query!(
            r#"
            INSERT INTO node_folder (id, node_id, display_name, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?4)
            "#,
            folder_id,
            node_id,
            name,
            now,
        )
        .execute(&mut *executor)
        .await?;

        Ok(folder_id)
    }

    pub async fn create_folder_node<'a, E>(
        executor: &mut E,
        parent_node_id: String,
        folder_id: String,
        folder_name: String,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let now = crate::utils::date::get_now_date();

        let node_id = Self::insert_node(executor, NodeKind::Folder, &now).await?;

        Self::insert_node_folder_binding(
            executor,
            node_id.clone(),
            folder_id.clone(),
            folder_name.clone(),
            now.clone(),
        )
        .await?;

        Self::create_contains_edges(executor, parent_node_id, node_id.clone(), now).await?;

        Ok(node_id)
    }

    pub async fn create_file_node<'a, E>(
        executor: &mut E,
        parent_node_id: String,
        file_content_id: String,
    ) -> Result<()>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let now = crate::utils::date::get_now_date();

        let node_id = Self::insert_node(executor, NodeKind::File, &now).await?;

        Self::insert_node_file_binding(
            executor,
            node_id.clone(),
            file_content_id.clone(),
            now.clone(),
        )
        .await?;

        Self::create_contains_edges(executor, parent_node_id, node_id, now).await?;

        Ok(())
    }
    async fn create_contains_edges<'a, E>(
        executor: &mut E,
        parent_node_id: String,
        child_node_id: String,
        now: String,
    ) -> Result<()>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let _ = ConnectionRepository::insert_connection(
            executor,
            parent_node_id.clone(),
            child_node_id.clone(),
            "contains".to_string(),
            now.clone(),
        )
        .await?;

        // child -> parent (containedIn)
        let _ = ConnectionRepository::insert_connection(
            executor,
            child_node_id.clone(),
            parent_node_id.clone(),
            "containedIn".to_string(),
            now.clone(),
        )
        .await?;

        Ok(())
    }
}

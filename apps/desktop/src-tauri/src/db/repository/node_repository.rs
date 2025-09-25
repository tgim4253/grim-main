use anyhow::Result;
use sqlx::{Executor, Sqlite};
use std::{collections::HashSet, str::FromStr};

use crate::{
    db::repository::connection_repository::ConnectionRepository,
    models::{
        connection::RelationType,
        file::{FileContent, FileType, NodeFolder},
        node::{Node, NodeData, NodeKind},
    },
    utils::identifier::get_unique_id,
};

/// Repository responsible for loading and mutating node metadata.
pub struct NodeRepository;

impl NodeRepository {
    /// Fetch the node identifier associated with a given file-content id.
    pub async fn fetch_node_id_by_fc_id<'a, E>(
        executor: &mut E,
        file_content_id: String,
    ) -> Result<Option<String>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let node_id = sqlx::query_scalar!(
            r#"
                SELECT node_id
                FROM node_file_binding
                WHERE file_content_id = ?1
            "#,
            file_content_id
        )
        .fetch_optional(executor)
        .await?;

        Ok(node_id)
    }

    /// Load nodes for the provided set of kinds.
    pub async fn fetch_all_nodes_by_kind<'a, E>(
        executor: &mut E,
        kinds: HashSet<NodeKind>,
    ) -> Result<Vec<Node>>
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

    /// Fetch file node data for the specified node identifier.
    pub async fn fetch_file_node_data<'a, E>(
        executor: &mut E,
        node_id: String,
    ) -> Result<NodeData>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        struct FileNodeRow {
            file_id: String,
            mime: String,
            size: i64,
            sha256: Option<String>,
            xxh3_64: String,
            file_name: String,
            kind: String,
        }

        let row: FileNodeRow = sqlx::query_as!(
            FileNodeRow,
            r#"
            SELECT
                c.id              AS "file_id!",
                c.mime            AS "mime!",
                c.size            AS "size!: i64",
                c.sha256          AS "sha256?",
                c.xxh3_64         AS "xxh3_64!",
                c.display_name    AS "file_name!",
                c.kind            AS "kind!"
            FROM node_file_binding b
            JOIN file_content c ON c.id = b.file_content_id
            WHERE b.node_id = ?1
        "#,
            node_id
        )
        .fetch_one(&mut *executor)
        .await?;

        Ok(NodeData::File(FileContent {
            node_id: node_id.clone(),
            file_id: row.file_id,
            kind: FileType::from_str(&row.kind).unwrap(),
            mime: row.mime,
            size: row.size,
            sha256: row.sha256,
            xxh3_64: row.xxh3_64,
            file_name: row.file_name,
        }))
    }

    /// Fetch folder node data for the specified node identifier.
    pub async fn fetch_folder_node_data<'a, E>(
        executor: &mut E,
        node_id: String,
    ) -> Result<NodeData>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        struct FolderNodeRow {
            folder_id: String,
            folder_name: String,
        }

        let row: FolderNodeRow = sqlx::query_as!(
            FolderNodeRow,
            r#"
            SELECT
                id              AS "folder_id!",
                display_name    AS "folder_name!"
            FROM node_folder
            WHERE node_id = ?1
        "#,
            node_id
        )
        .fetch_one(&mut *executor)
        .await?;

        Ok(NodeData::Folder(NodeFolder {
            folder_id: row.folder_id,
            node_id: node_id,
            folder_name: row.folder_name,
        }))
    }

    /// Fetch node records and their data for the provided identifiers.
    pub async fn fetch_nodes_by_ids<'a, E>(
        executor: &mut E,
        ids: Vec<String>,
    ) -> Result<Vec<Node>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let ids = serde_json::to_string(&ids)?;

        struct Row {
            id: String,
            kind: String,
            created_at: String,
            updated_at: String,
        }

        let nodes: Vec<Row> = sqlx::query_as!(
            Row,
            r#"
            SELECT
                n.id          AS "id!",
                n.kind        AS "kind!: _",
                n.created_at  AS "created_at!",
                n.updated_at  AS "updated_at!"
            FROM node n
            WHERE n.id IN (SELECT value FROM json_each(?1))
            "#,
            ids,
        )
        .fetch_all(&mut *executor)
        .await?;
        let mut out = Vec::with_capacity(nodes.len());

        for node in nodes.iter() {
            let kind = NodeKind::from_str(&node.kind)?; // propagate parse error if any
            let data = match kind {
                NodeKind::Folder => Some(
                    Self::fetch_folder_node_data(
                        &mut *executor,
                        node.id.clone(),
                    )
                    .await?,
                ),
                NodeKind::File => Some(
                    Self::fetch_file_node_data(&mut *executor, node.id.clone())
                        .await?,
                ),
                _ => None,
            };
            out.push(Node {
                id: node.id.clone(),
                kind: kind,
                data: data,
                created_at: node.created_at.clone(),
                updated_at: node.updated_at.clone(),
            });
        }

        Ok(out)
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
                data: Some(NodeData::Folder({
                    NodeFolder {
                        folder_id: row.folder_id,
                        node_id: row.node_id.clone(),
                        folder_name: row.folder_name,
                    }
                })),
                created_at: row.created_at,
                updated_at: row.updated_at,
            });
        }

        Ok(nodes)
    }

    /// Retrieve all nodes that represent files.
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
                data: Some(NodeData::File(FileContent {
                    node_id: row.node_id.clone(),
                    file_id: row.file_id,
                    kind: FileType::from_str(&row.kind).unwrap(),
                    mime: row.mime,
                    size: row.size,
                    sha256: row.sha256,
                    xxh3_64: row.xxh3_64,
                    file_name: row.file_name,
                })),
                created_at: row.created_at,
                updated_at: row.updated_at,
            });
        }

        Ok(nodes)
    }

    /// Insert a bare node record with the provided kind.
    pub async fn insert_node<'a, E>(
        executor: &mut E,
        kind: NodeKind,
        now: &str,
    ) -> Result<String>
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

    /// Create a file node without attaching it to a folder hierarchy.
    pub async fn create_orphan_file_node<'a, E>(
        executor: &mut E,
        file_content_id: String,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let now = crate::utils::date::get_now_date();
        let node_id = Self::insert_node(executor, NodeKind::File, &now).await?;
        Self::insert_node_file_binding(
            executor,
            node_id.clone(),
            file_content_id,
            now,
        )
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

    /// Insert a row linking a folder node to folder metadata.
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

    /// Create a new folder node under the provided parent node.
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

        let node_id =
            Self::insert_node(executor, NodeKind::Folder, &now).await?;

        Self::insert_node_folder_binding(
            executor,
            node_id.clone(),
            folder_id.clone(),
            folder_name.clone(),
            now.clone(),
        )
        .await?;

        Self::create_folder_to_folder_edges(
            executor,
            parent_node_id,
            node_id.clone(),
            now,
        )
        .await?;

        Ok(node_id)
    }

    /// Ensure a file node exists for the provided content identifier.
    pub async fn upsert_file_node<'a, E>(
        executor: &mut E,
        parent_node_id: String,
        file_content_id: String,
    ) -> Result<()>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let now = crate::utils::date::get_now_date();

        let node_id = if let Some(node_id) =
            NodeRepository::fetch_node_id_by_fc_id(
                executor,
                file_content_id.clone(),
            )
            .await?
        {
            node_id
        } else {
            let node_id =
                Self::insert_node(executor, NodeKind::File, &now).await?;
            Self::insert_node_file_binding(
                executor,
                node_id.clone(),
                file_content_id.clone(),
                now.clone(),
            )
            .await?;
            node_id
        };

        // todo: upsert containse_edges?
        if let Err(e) = Self::create_folder_file_edges(
            executor,
            parent_node_id,
            node_id,
            now,
        )
        .await
        {};

        Ok(())
    }
    /// Create bidirectional edges between parent and child folder nodes.
    async fn create_folder_to_folder_edges<'a, E>(
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
            RelationType::ChildFolder,
            now.clone(),
        )
        .await?;

        // child -> parent (containedIn)
        let _ = ConnectionRepository::insert_connection(
            executor,
            child_node_id.clone(),
            parent_node_id.clone(),
            RelationType::ParentFolder,
            now.clone(),
        )
        .await?;

        Ok(())
    }

    /// Create bidirectional edges between a folder node and a file node.
    async fn create_folder_file_edges<'a, E>(
        executor: &mut E,
        folder_node_id: String,
        file_node_id: String,
        now: String,
    ) -> Result<()>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let _ = ConnectionRepository::insert_connection(
            executor,
            folder_node_id.clone(),
            file_node_id.clone(),
            RelationType::ContainsFile,
            now.clone(),
        )
        .await?;

        // child -> parent (containedIn)
        let _ = ConnectionRepository::insert_connection(
            executor,
            file_node_id.clone(),
            folder_node_id.clone(),
            RelationType::BelongToFolder,
            now.clone(),
        )
        .await?;

        Ok(())
    }
}

use std::collections::HashSet;

use anyhow::Result;
use sqlx::{Executor, Sqlite};

use crate::{
    db::repository::node_repository::NodeRepository,
    models::{connection::Connection, graph::GraphResponse, node},
};

pub struct GraphRepository;

impl GraphRepository {
    pub async fn get_graph_from_root<'a, E>(
        executor: &mut E,
        root_node_id: String,
        depth: Option<i32>,
    ) -> Result<GraphResponse>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let depth = depth.unwrap_or(100);

        struct Row {
            id: String,
            src_node_id: String,
            dst_node_id: String,
            path_level: i32,
            kind_rule_id: String,
            kind: String,
        }

        // if path_level is 3, stop Traversal
        let rows = sqlx::query_as!(
            Row,
            r#"
            WITH RECURSIVE
            walk(
                id,
                src_node_id,
                dst_node_id,
                path_level,   -- INTEGER
                visited,      -- TEXT: comma-separated node ids
                kind_rule_id, -- TEXT
                kind,         -- TEXT
                depth         -- INTEGER
            ) AS (
                -- seed
                SELECT
                c.id,
                c.src_node_id,
                c.dst_node_id,
                CAST(ck.default_level AS INTEGER)                 AS path_level,   -- 4
                CAST(c.src_node_id AS TEXT)                       AS visited,      -- 5
                CAST(c.kind_id AS TEXT)                           AS kind_rule_id, -- 6
                CAST(ck.kind AS TEXT)                             AS kind,         -- 7
                1                                                AS depth         -- 8
                FROM connection c
                JOIN connection_kind_rule ck ON c.kind_id = ck.id
                WHERE c.src_node_id = ?1

                UNION ALL

                -- recursive
                SELECT
                c.id,
                c.src_node_id,
                c.dst_node_id,
                CAST(ck.default_level AS INTEGER)               AS path_level,
                w.visited || ',' || CAST(c.src_node_id AS TEXT) AS visited,
                CAST(c.kind_id AS TEXT)                         AS kind_rule_id,
                CAST(ck.kind AS TEXT)                           AS kind,
                w.depth + 1                                     AS depth
                FROM walk w
                JOIN connection c ON c.src_node_id = w.dst_node_id
                JOIN connection_kind_rule ck ON c.kind_id = ck.id
                                        AND w.path_level != 3
                WHERE w.depth < ?2
                AND instr(',' || w.visited || ',', ',' || CAST(c.dst_node_id AS TEXT) || ',') = 0
            )
            SELECT
            CAST(id AS TEXT)          AS "id!: String",
            CAST(src_node_id AS TEXT) AS "src_node_id!: String",
            CAST(dst_node_id AS TEXT) AS "dst_node_id!: String",
            CAST(path_level AS INT)   AS "path_level!: i32",
            kind_rule_id              AS "kind_rule_id!: String",
            kind                      AS "kind!: String"
            FROM walk;

            "#,
            root_node_id,
            depth
        )
        .fetch_all(&mut *executor)
        .await?;

        let mut node_ids: HashSet<String> = HashSet::new();
        let mut connections: Vec<Connection> = Vec::new();

        for row in rows {
            node_ids.insert(row.src_node_id.clone());
            node_ids.insert(row.dst_node_id.clone());

            connections.push(Connection {
                id: row.id,
                src_node_id: row.src_node_id,
                dst_node_id: row.dst_node_id,
                kind_rule_id: row.kind_rule_id,
                kind: row.kind,
                level: row.path_level,
            });
        }

        let nodes =
            NodeRepository::fetch_nodes_by_ids(&mut *executor, node_ids.into_iter().collect())
                .await?;

        Ok(GraphResponse { nodes: nodes, connections: connections, root_node_id: root_node_id })
    }
}

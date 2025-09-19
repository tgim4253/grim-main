use anyhow::Result;
use sqlx::{Executor, Sqlite};

use crate::models::connection::{Connection, RelationType};

/// Persistence helpers for working with graph connections.
pub struct ConnectionRepository;

impl ConnectionRepository {
    /// Load all connections associated with the provided node ids.
    pub async fn fetch_connections<'a, E>(
        executor: &mut E,
        ids: Vec<String>,
    ) -> Result<Vec<Connection>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let ids = serde_json::to_string(&ids)?;

        let connections: Vec<Connection> = sqlx::query_as!(
            Connection,
            r#"
            SELECT
                c.id              AS "id!",
                c.src_node_id     AS "src_node_id!",
                c.dst_node_id     AS "dst_node_id!",
                c.kind_id         AS "kind_rule_id!",
                ckr.kind          AS "kind!",
                ckr.default_level AS "level!: i32"
            FROM connection c
            LEFT JOIN connection_kind_rule ckr ON c.kind_id = ckr.id
            WHERE c.src_node_id IN (SELECT value FROM json_each(?1))
            "#,
            ids,
        )
        .fetch_all(&mut *executor)
        .await?;

        Ok(connections)
    }

    /// Insert a new connection edge between two nodes.
    pub async fn insert_connection<'a, E>(
        executor: &mut E,
        src_node_id: String,
        dst_node_id: String,
        kind: RelationType,
        now: String,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let connection_id = crate::utils::identifier::get_unique_id();

        sqlx::query!(
            r#"
            INSERT INTO connection (id, src_node_id, dst_node_id, kind_id, created_at)
            VALUES (
                ?1,
                ?2,
                ?3,
                (SELECT id FROM connection_kind_rule WHERE kind = ?4),
                ?5
            )
            "#,
            connection_id,
            src_node_id,
            dst_node_id,
            kind,
            now,
        )
        .execute(&mut *executor)
        .await?;

        Ok(connection_id)
    }
}

use anyhow::Result;
use sqlx::{Executor, Sqlite};

use crate::models::memo::NodeMemo;

/// Repository helpers for memo nodes.
pub struct MemoRepository;

pub struct NewMemo<'a> {
    pub node_id: &'a str,
    pub text: &'a str,
    pub now: &'a str,
}

impl MemoRepository {
    pub async fn insert_memo<'a, E>(
        executor: &mut E,
        memo: NewMemo<'a>,
    ) -> Result<()>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        sqlx::query!(
            r#"
            INSERT INTO node_memo (node_id, text, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?3)
            "#,
            memo.node_id,
            memo.text,
            memo.now,
        )
        .execute(&mut *executor)
        .await?;

        Ok(())
    }

    pub async fn update_memo_text<'a, E>(
        executor: &mut E,
        node_id: &str,
        text: &str,
        now: &str,
    ) -> Result<()>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        sqlx::query!(
            r#"
            UPDATE node_memo
            SET text = ?2,
                updated_at = ?3
            WHERE node_id = ?1
            "#,
            node_id,
            text,
            now,
        )
        .execute(&mut *executor)
        .await?;

        sqlx::query!(
            r#"
            UPDATE node
            SET updated_at = ?2
            WHERE id = ?1
            "#,
            node_id,
            now,
        )
        .execute(&mut *executor)
        .await?;

        Ok(())
    }

    pub async fn fetch_memos_by_node_ids<'a, E>(
        executor: &mut E,
        node_ids: &[String],
    ) -> Result<Vec<NodeMemo>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        if node_ids.is_empty() {
            return Ok(Vec::new());
        }

        let ids_json = serde_json::to_string(node_ids)?;

        let rows = sqlx::query!(
            r#"
            SELECT
                node_id           AS "node_id!",
                text              AS "text!",
                created_at        AS "created_at!",
                updated_at        AS "updated_at!"
            FROM node_memo
            WHERE node_id IN (SELECT value FROM json_each(?1))
            "#,
            ids_json,
        )
        .fetch_all(&mut *executor)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| NodeMemo {
                node_id: row.node_id,
                text: row.text,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect())
    }
}

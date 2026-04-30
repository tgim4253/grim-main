use anyhow::{bail, Result};
use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::{
    models::tag::{
        DeleteTagGroupPayload, DeleteTagPayload, SaveTagGroupPayload,
        SaveTagPayload, Tag, TagGroup, TagIndex,
    },
    utils::{date::get_now_date, identifier::get_unique_id},
};

use super::mappers::{tag_from_row, tag_group_from_row, TagGroupRow, TagRow};

pub(crate) const TAG_GROUP_SESSION_STEPS: &str = "Session Steps";

#[derive(Clone)]
pub struct TagRepository {
    pool: SqlitePool,
}

impl TagRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list_groups(&self) -> Result<Vec<TagGroup>> {
        let rows = sqlx::query_as!(
            TagGroupRow,
            r#"
            SELECT id, name, sort_order, created_at, updated_at
            FROM tag_group
            ORDER BY sort_order ASC, name ASC
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(tag_group_from_row).collect())
    }

    pub async fn list_tags(&self) -> Result<Vec<Tag>> {
        let rows = sqlx::query_as!(
            TagRow,
            r#"
            SELECT id, group_id, name, color, sort_order, created_at, updated_at
            FROM tag
            ORDER BY COALESCE(group_id, ''), sort_order ASC, name ASC
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(tag_from_row).collect())
    }

    pub async fn load_index(&self) -> Result<TagIndex> {
        Ok(TagIndex {
            groups: self.list_groups().await?,
            tags: self.list_tags().await?,
        })
    }

    pub async fn save_tag_group(
        &self,
        payload: SaveTagGroupPayload,
    ) -> Result<()> {
        let name = payload.name.trim();
        if name.is_empty() {
            bail!("Tag group name is required");
        }

        let now = get_now_date();
        let now_ref = now.as_str();
        let group_id = payload.id.clone().unwrap_or_else(get_unique_id);
        let group_id_ref = group_id.as_str();
        let sort_order = payload.sort_order.unwrap_or(0);

        if payload.id.is_some() {
            sqlx::query!(
                r#"
                UPDATE tag_group
                SET name = ?2, sort_order = ?3, updated_at = ?4
                WHERE id = ?1
                "#,
                group_id_ref,
                name,
                sort_order,
                now_ref
            )
            .execute(&self.pool)
            .await?;
        } else {
            sqlx::query!(
                r#"
                INSERT INTO tag_group (id, name, sort_order, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?4)
                "#,
                group_id_ref,
                name,
                sort_order,
                now_ref
            )
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    pub async fn delete_tag_group(
        &self,
        payload: DeleteTagGroupPayload,
    ) -> Result<()> {
        let tag_group_id = payload.tag_group_id.as_str();
        sqlx::query!("DELETE FROM tag_group WHERE id = ?1", tag_group_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn save_tag(&self, payload: SaveTagPayload) -> Result<()> {
        let name = payload.name.trim();
        if name.is_empty() {
            bail!("Tag name is required");
        }

        let now = get_now_date();
        let now_ref = now.as_str();
        let tag_id = payload.id.clone().unwrap_or_else(get_unique_id);
        let tag_id_ref = tag_id.as_str();
        let group_id = payload.group_id.as_deref();
        let color = payload.color.as_deref();
        let sort_order = payload.sort_order.unwrap_or(0);

        if payload.id.is_some() {
            sqlx::query!(
                r#"
                UPDATE tag
                SET group_id = ?2, name = ?3, color = ?4, sort_order = ?5, updated_at = ?6
                WHERE id = ?1
                "#,
                tag_id_ref,
                group_id,
                name,
                color,
                sort_order,
                now_ref
            )
            .execute(&self.pool)
            .await?;
        } else {
            sqlx::query!(
                r#"
                INSERT INTO tag (id, group_id, name, color, sort_order, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
                "#,
                tag_id_ref,
                group_id,
                name,
                color,
                sort_order,
                now_ref
            )
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }

    pub async fn delete_tag(&self, payload: DeleteTagPayload) -> Result<()> {
        let tag_id = payload.tag_id.as_str();
        let record_usage = sqlx::query!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM croquis_record_tag
            WHERE tag_id = ?1
            "#,
            tag_id
        )
        .fetch_one(&self.pool)
        .await?
        .count;
        let step_usage = sqlx::query!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM session_step_preset_tag
            WHERE tag_id = ?1
            "#,
            tag_id
        )
        .fetch_one(&self.pool)
        .await?
        .count;

        if record_usage > 0 || step_usage > 0 {
            bail!(
                "Cannot delete tag because it is used by {} records and {} session steps.",
                record_usage,
                step_usage
            );
        }

        sqlx::query!("DELETE FROM tag WHERE id = ?1", tag_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    async fn ensure_tag_group_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        name: &str,
    ) -> Result<TagGroup> {
        if let Some(row) = sqlx::query_as!(
            TagGroupRow,
            "SELECT id, name, sort_order, created_at, updated_at FROM tag_group WHERE name = ?1",
            name
        )
        .fetch_optional(&mut **tx)
        .await?
        {
            return Ok(tag_group_from_row(row));
        }

        let id = get_unique_id();
        let now = get_now_date();
        let id_ref = id.as_str();
        let now_ref = now.as_str();
        sqlx::query!(
            "INSERT INTO tag_group (id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, 0, ?3, ?3)",
            id_ref,
            name,
            now_ref
        )
        .execute(&mut **tx)
        .await?;

        Ok(TagGroup {
            id,
            name: name.to_string(),
            sort_order: 0,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn ensure_tags_by_names_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        names: &[String],
    ) -> Result<Vec<Tag>> {
        if names.is_empty() {
            return Ok(Vec::new());
        }

        let group =
            self.ensure_tag_group_in_tx(tx, TAG_GROUP_SESSION_STEPS).await?;
        let mut tags = Vec::new();

        for raw_name in names {
            let name = raw_name.trim();
            if name.is_empty() {
                continue;
            }
            let group_id = group.id.as_str();

            if let Some(row) = sqlx::query_as!(
                TagRow,
                r#"
                SELECT id, group_id, name, color, sort_order, created_at, updated_at
                FROM tag
                WHERE group_id = ?1 AND name = ?2
                "#,
                group_id,
                name
            )
            .fetch_optional(&mut **tx)
            .await?
            {
                tags.push(tag_from_row(row));
                continue;
            }

            let now = get_now_date();
            let tag = Tag {
                id: get_unique_id(),
                group_id: Some(group.id.clone()),
                name: name.to_string(),
                color: None,
                sort_order: 0,
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            let tag_id = tag.id.as_str();
            let tag_group_id = tag.group_id.as_deref();
            let tag_name = tag.name.as_str();
            let tag_created_at = tag.created_at.as_str();

            sqlx::query!(
                r#"
                INSERT INTO tag (id, group_id, name, color, sort_order, created_at, updated_at)
                VALUES (?1, ?2, ?3, NULL, 0, ?4, ?4)
                "#,
                tag_id,
                tag_group_id,
                tag_name,
                tag_created_at
            )
            .execute(&mut **tx)
            .await?;
            tags.push(tag);
        }

        Ok(tags)
    }
}

#[cfg(test)]
mod tests {
    use std::{env, fs, path::PathBuf};

    use crate::state::bootstrap::{
        ensure_schema, open_or_create_db, seed_defaults,
    };

    use super::*;

    fn make_temp_dir(name: &str) -> PathBuf {
        let dir = env::temp_dir()
            .join(format!("grim-tag-repository-{name}-{}", get_unique_id()));
        fs::create_dir_all(&dir).expect("failed to create temp dir");
        dir
    }

    #[tokio::test]
    async fn delete_tag_rejects_record_and_session_step_usage() {
        let dir = make_temp_dir("delete-usage");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

        let tag_id = sqlx::query!(
            r#"
            SELECT t.id
            FROM tag t
            INNER JOIN tag_group tg ON tg.id = t.group_id
            WHERE tg.name = 'Purpose'
              AND t.name = 'Pose'
            "#
        )
        .fetch_one(&pool)
        .await
        .expect("failed to load tag")
        .id;
        let tag_id_ref = tag_id.as_str();

        sqlx::query!(
            r#"
            INSERT INTO croquis_record
            (id, title, created_at, updated_at)
            VALUES ('record-tag-usage', 'Record tag usage', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
            "#
        )
        .execute(&pool)
        .await
        .expect("failed to insert record");

        sqlx::query!(
            r#"
            INSERT INTO croquis_record_tag (record_id, tag_id, created_at)
            VALUES ('record-tag-usage', ?1, '2026-01-01T00:00:00Z')
            "#,
            tag_id_ref
        )
        .execute(&pool)
        .await
        .expect("failed to link record tag");

        sqlx::query!(
            r#"
            INSERT INTO session_step_preset_tag (step_preset_id, tag_id, created_at)
            SELECT ssp.id, ?1, '2026-01-01T00:00:00Z'
            FROM session_step_preset ssp
            ORDER BY ssp.step_order ASC
            LIMIT 1
            "#,
            tag_id_ref
        )
        .execute(&pool)
        .await
        .expect("failed to link session step tag");

        let result = TagRepository::new(pool.clone())
            .delete_tag(DeleteTagPayload { tag_id: tag_id.clone() })
            .await;

        assert!(result.is_err());

        let tag_row = sqlx::query!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM tag
            WHERE id = ?1
            "#,
            tag_id_ref
        )
        .fetch_one(&pool)
        .await
        .expect("failed to count tag");

        assert_eq!(tag_row.count, 1);

        let _ = fs::remove_dir_all(dir);
    }
}

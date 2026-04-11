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

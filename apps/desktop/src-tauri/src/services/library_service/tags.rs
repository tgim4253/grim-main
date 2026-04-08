use anyhow::{bail, Result};
use sqlx::{Row, Sqlite};

use crate::{
    models::library::{
        DeleteTagGroupPayload, DeleteTagPayload, SaveTagGroupPayload,
        SaveTagPayload, Tag, TagGroup, TagIndex,
    },
    utils::{date::get_now_date, identifier::get_unique_id},
};

use super::{mappers::tag_from_row, runtime::pool, TAG_GROUP_SESSION_STEPS};

pub async fn list_tag_groups() -> Result<Vec<TagGroup>> {
    let pool = pool()?;
    let rows = sqlx::query(
        r#"
        SELECT id, name, sort_order, created_at, updated_at
        FROM tag_group
        ORDER BY sort_order ASC, name ASC
        "#,
    )
    .fetch_all(&pool)
    .await?;

    rows.into_iter()
        .map(|row| {
            Ok(TagGroup {
                id: row.try_get("id")?,
                name: row.try_get("name")?,
                sort_order: row.try_get("sort_order")?,
                created_at: row.try_get("created_at")?,
                updated_at: row.try_get("updated_at")?,
            })
        })
        .collect()
}

pub async fn list_tags() -> Result<Vec<Tag>> {
    let pool = pool()?;
    let rows = sqlx::query(
        r#"
        SELECT id, group_id, name, color, sort_order, created_at, updated_at
        FROM tag
        ORDER BY COALESCE(group_id, ''), sort_order ASC, name ASC
        "#,
    )
    .fetch_all(&pool)
    .await?;

    rows.into_iter().map(tag_from_row).collect()
}

pub async fn load_tag_index() -> Result<TagIndex> {
    Ok(TagIndex { groups: list_tag_groups().await?, tags: list_tags().await? })
}

pub async fn save_tag_group(payload: SaveTagGroupPayload) -> Result<TagIndex> {
    let name = payload.name.trim();
    if name.is_empty() {
        bail!("Tag group name is required");
    }

    let pool = pool()?;
    let now = get_now_date();
    let group_id = payload.id.clone().unwrap_or_else(get_unique_id);
    let sort_order = payload.sort_order.unwrap_or(0);

    if payload.id.is_some() {
        sqlx::query(
            r#"
            UPDATE tag_group
            SET name = ?2, sort_order = ?3, updated_at = ?4
            WHERE id = ?1
            "#,
        )
        .bind(&group_id)
        .bind(name)
        .bind(sort_order)
        .bind(&now)
        .execute(&pool)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO tag_group (id, name, sort_order, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?4)
            "#,
        )
        .bind(&group_id)
        .bind(name)
        .bind(sort_order)
        .bind(&now)
        .execute(&pool)
        .await?;
    }

    load_tag_index().await
}

pub async fn delete_tag_group(
    payload: DeleteTagGroupPayload,
) -> Result<TagIndex> {
    let pool = pool()?;
    sqlx::query("DELETE FROM tag_group WHERE id = ?1")
        .bind(&payload.tag_group_id)
        .execute(&pool)
        .await?;

    load_tag_index().await
}

pub async fn save_tag(payload: SaveTagPayload) -> Result<TagIndex> {
    let name = payload.name.trim();
    if name.is_empty() {
        bail!("Tag name is required");
    }

    let pool = pool()?;
    let now = get_now_date();
    let tag_id = payload.id.clone().unwrap_or_else(get_unique_id);
    let sort_order = payload.sort_order.unwrap_or(0);

    if payload.id.is_some() {
        sqlx::query(
            r#"
            UPDATE tag
            SET group_id = ?2, name = ?3, color = ?4, sort_order = ?5, updated_at = ?6
            WHERE id = ?1
            "#,
        )
        .bind(&tag_id)
        .bind(payload.group_id.as_deref())
        .bind(name)
        .bind(payload.color.as_deref())
        .bind(sort_order)
        .bind(&now)
        .execute(&pool)
        .await?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO tag (id, group_id, name, color, sort_order, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
            "#,
        )
        .bind(&tag_id)
        .bind(payload.group_id.as_deref())
        .bind(name)
        .bind(payload.color.as_deref())
        .bind(sort_order)
        .bind(&now)
        .execute(&pool)
        .await?;
    }

    load_tag_index().await
}

pub async fn delete_tag(payload: DeleteTagPayload) -> Result<TagIndex> {
    let pool = pool()?;
    sqlx::query("DELETE FROM tag WHERE id = ?1")
        .bind(&payload.tag_id)
        .execute(&pool)
        .await?;

    load_tag_index().await
}

async fn ensure_tag_group(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    name: &str,
) -> Result<TagGroup> {
    if let Some(row) = sqlx::query(
        "SELECT id, name, sort_order, created_at, updated_at FROM tag_group WHERE name = ?1",
    )
    .bind(name)
    .fetch_optional(&mut **tx)
    .await?
    {
        return Ok(TagGroup {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            sort_order: row.try_get("sort_order")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
        });
    }

    let id = get_unique_id();
    let now = get_now_date();
    sqlx::query(
        "INSERT INTO tag_group (id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, 0, ?3, ?3)",
    )
    .bind(&id)
    .bind(name)
    .bind(&now)
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

pub(super) async fn ensure_tags_by_names(
    tx: &mut sqlx::Transaction<'_, Sqlite>,
    names: &[String],
) -> Result<Vec<Tag>> {
    if names.is_empty() {
        return Ok(Vec::new());
    }

    let group = ensure_tag_group(tx, TAG_GROUP_SESSION_STEPS).await?;
    let mut tags = Vec::new();

    for raw_name in names {
        let name = raw_name.trim();
        if name.is_empty() {
            continue;
        }

        if let Some(row) = sqlx::query(
            r#"
            SELECT id, group_id, name, color, sort_order, created_at, updated_at
            FROM tag
            WHERE group_id = ?1 AND name = ?2
            "#,
        )
        .bind(&group.id)
        .bind(name)
        .fetch_optional(&mut **tx)
        .await?
        {
            tags.push(tag_from_row(row)?);
            continue;
        }

        let tag = Tag {
            id: get_unique_id(),
            group_id: Some(group.id.clone()),
            name: name.to_string(),
            color: None,
            sort_order: 0,
            created_at: get_now_date(),
            updated_at: get_now_date(),
        };

        sqlx::query(
            r#"
            INSERT INTO tag (id, group_id, name, color, sort_order, created_at, updated_at)
            VALUES (?1, ?2, ?3, NULL, 0, ?4, ?4)
            "#,
        )
        .bind(&tag.id)
        .bind(tag.group_id.as_deref())
        .bind(&tag.name)
        .bind(&tag.created_at)
        .execute(&mut **tx)
        .await?;
        tags.push(tag);
    }

    Ok(tags)
}

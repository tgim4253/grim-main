use anyhow::Result;
use sqlx::{Executor, Sqlite};

use crate::models::crop::ImageCrop;

/// Repository helpers for managing crop metadata.
pub struct CropRepository;

/// Parameters required to persist a new crop row.
pub struct NewImageCrop<'a> {
    pub node_id: &'a str,
    pub origin_file_id: &'a str,
    pub origin_hash: &'a str,
    pub start_x: f64,
    pub start_y: f64,
    pub width: f64,
    pub height: f64,
    pub reference_width: Option<i64>,
    pub reference_height: Option<i64>,
    pub is_relative: bool,
    pub now: &'a str,
}

impl CropRepository {
    /// Insert crop metadata for the specified node.
    pub async fn insert_crop<'a, E>(
        executor: &mut E,
        params: NewImageCrop<'_>,
    ) -> Result<()>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        sqlx::query!(
            r#"
            INSERT INTO node_crop (
                node_id,
                origin_file_content_id,
                origin_hash,
                start_x,
                start_y,
                width,
                height,
                reference_width,
                reference_height,
                is_relative,
                created_at,
                updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
            "#,
            params.node_id,
            params.origin_file_id,
            params.origin_hash,
            params.start_x,
            params.start_y,
            params.width,
            params.height,
            params.reference_width,
            params.reference_height,
            if params.is_relative { 1 } else { 0 },
            params.now,
        )
        .execute(&mut *executor)
        .await?;

        Ok(())
    }

    /// Fetch crop metadata associated with the provided node identifier.
    pub async fn fetch_crop_by_node_id<'a, E>(
        executor: &mut E,
        node_id: &str,
    ) -> Result<Option<ImageCrop>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        struct ImageCropRow {
            node_id: String,
            origin_file_content_id: String,
            origin_hash: String,
            start_x: f64,
            start_y: f64,
            width: f64,
            height: f64,
            reference_width: Option<i64>,
            reference_height: Option<i64>,
            is_relative: i64,
            created_at: String,
            updated_at: String,
        }

        let row = sqlx::query_as!(
            ImageCropRow,
            r#"
            SELECT
                node_id               AS "node_id!",
                origin_file_content_id AS "origin_file_content_id!",
                origin_hash           AS "origin_hash!",
                start_x               AS "start_x!",
                start_y               AS "start_y!",
                width                 AS "width!",
                height                AS "height!",
                reference_width       AS "reference_width?",
                reference_height      AS "reference_height?",
                is_relative           AS "is_relative!",
                created_at            AS "created_at!",
                updated_at            AS "updated_at!"
            FROM node_crop
            WHERE node_id = ?1
            "#,
            node_id,
        )
        .fetch_optional(&mut *executor)
        .await?;

        Ok(row.map(|row| ImageCrop {
            node_id: row.node_id,
            origin_file_id: row.origin_file_content_id,
            origin_hash: row.origin_hash,
            start_x: row.start_x,
            start_y: row.start_y,
            width: row.width,
            height: row.height,
            reference_width: row.reference_width,
            reference_height: row.reference_height,
            is_relative: row.is_relative != 0,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }))
    }
}

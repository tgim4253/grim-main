use std::path::PathBuf;

use anyhow::{anyhow, Result};
use sqlx::{Executor, Sqlite};

use crate::{
    config::file::MatchStates,
    db::repository::node_repository::NodeRepository,
    models::{
        file::{FileInfo, NodeFolder, RealFolderData},
        node::{Node, NodeData, NodeKind},
    },
    utils::{date::get_now_date, identifier::get_unique_id},
};

pub struct FileRepository;

impl FileRepository {
    pub async fn create_virtual_folder_mount<'a, E>(
        executor: &mut E,
        virtual_node_id: String,
        real_folder_id: String,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let mount_id = get_unique_id();
        let now = crate::utils::date::get_now_date();
        // todo: enable, priority, recursive setting from front
        sqlx::query(
            r#"
        INSERT INTO virtual_folder_mount
            (id, virtual_node_id, real_folder_id, created_at, enabled, priority, recursive)
        VALUES
            (?1, ?2, ?3, ?4, 1, 0, 1)
        "#,
        )
        .bind(&mount_id)
        .bind(&virtual_node_id)
        .bind(&real_folder_id)
        .bind(&now)
        .execute(&mut *executor)
        .await?;

        Ok(mount_id)
    }

    pub async fn _find_folder_id<'a, E>(
        executor: &mut E,
        sroot_id: String,
        current_parent_id: Option<String>,
        name_norm: String,
    ) -> Result<Option<String>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let folder_id = sqlx::query_scalar!(
            r#"
            SELECT id AS "id!"
            FROM real_folder
            WHERE storage_root_id = ?1 AND parent_id IS ?2 AND name_norm = ?3
            "#,
            sroot_id,
            current_parent_id,
            name_norm
        )
        .fetch_optional(&mut *executor)
        .await?;

        Ok(folder_id)
    }

    pub async fn create_virtual_folder<'a, E>(
        executor: &mut E,
        name: String,
        parent_id: String,
    ) -> Result<Node>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let folder_id = get_unique_id();
        let now = get_now_date();

        let node_id = NodeRepository::create_folder_node(
            &mut *executor,
            parent_id.clone(),
            folder_id.clone(),
            name.clone(),
        )
        .await?;

        Ok(Node {
            id: node_id.clone(),
            kind: NodeKind::Folder,
            data: Some(NodeData::Folder(NodeFolder {
                folder_id,
                node_id: node_id.clone(),
                folder_name: name,
            })),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub async fn upsert_real_folder<'a, E>(
        executor: &mut E,
        folder_info: &RealFolderData,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let new_id = get_unique_id();
        let now = crate::utils::date::get_now_date();

        let folder_id = sqlx::query_scalar!(
            r#"
            INSERT INTO real_folder
                (id, storage_root_id, parent_id, name, name_norm, root_rel_path, abs_path_cached, mtime, error_flag, error_msg, created_at, updated_at)
            VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'success', NULL, ?9, ?10)
            ON CONFLICT(storage_root_id, parent_key, name_norm) DO UPDATE SET
                name        = excluded.name,
                name_norm   = excluded.name_norm,
                mtime       = excluded.mtime,
                root_rel_path = excluded.root_rel_path,
                abs_path_cached = excluded.abs_path_cached,
                error_flag  = 'success',
                error_msg   = NULL,
                updated_at  = ?10
            RETURNING id as "id!: String"
            "#,
            new_id,
            folder_info.storage_root_id,
            folder_info.parent_id,
            folder_info.name,
            folder_info.name_norm,
            folder_info.root_rel_path,
            folder_info.abs_path_cached,
            folder_info.mtime,
            now,
            now
        )
        .fetch_one(&mut *executor)
        .await
        .map_err(|e| anyhow!(format!("Failed to upsert real_folder: {}", e)))?;

        Ok(folder_id)
    }

    pub async fn find_file_content_id<'a, E>(
        executor: &mut E,
        xxh3_64: String,
    ) -> Result<Option<String>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let id = sqlx::query_scalar!(
            "SELECT id AS 'id!' FROM file_content WHERE xxh3_64 = ?1",
            xxh3_64
        )
        .fetch_optional(&mut *executor)
        .await?;
        Ok(id)
    }

    pub async fn upsert_file_content<'a, E>(
        executor: &mut E,
        file_info: &FileInfo,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let now = crate::utils::date::get_now_date();
        let new_id = get_unique_id();

        let file_content_id = sqlx::query_scalar!(
            r#"
            INSERT INTO file_content
                (id, mime, size, xxh3_64, sha256, kind, display_name, created_at, updated_at)
            VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(xxh3_64) DO UPDATE SET
                mime         = excluded.mime,
                size         = excluded.size,
                kind         = excluded.kind,
                display_name = excluded.display_name,
                sha256        = excluded.sha256,
                xxh3_64      = excluded.xxh3_64,
                updated_at   = excluded.updated_at
            RETURNING id as "id!: String"
            "#,
            new_id,
            file_info.mime_guess,
            file_info.file_size,
            file_info.xxh3_64,
            file_info.sha256,
            file_info.kind_guess,
            file_info.file_name,
            now,
            now
        )
        .fetch_one(&mut *executor)
        .await
        .map_err(|e| anyhow!(format!("Failed to upsert file_content: {}", e)))?;

        Ok(file_content_id)
    }

    pub async fn upsert_file_path_content_binding<'a, E>(
        executor: &mut E,
        file_path_id: &str,
        file_content_id: &str,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let now = crate::utils::date::get_now_date();
        let new_id = get_unique_id();
        sqlx::query!(
            r#"
            INSERT INTO file_path_content_binding
                (id, file_path_id, file_content_id, match_states,is_active, created_at, updated_at, detected_at, resolved_at)
            VALUES
                (?1, ?2, ?3, ?4, 1, ?5, ?5, ?5, ?5)
            ON CONFLICT(file_path_id, file_content_id) DO UPDATE SET
                match_states = excluded.match_states,
                is_active = 1,
                updated_at   = excluded.updated_at
            RETURNING id as "id!: String"
            "#,
            new_id,
            file_path_id,
            file_content_id,
            MatchStates::Match,
            now
        )
        .fetch_one(&mut *executor)
        .await
        .map_err(|e| anyhow!(format!("Failed to upsert file_path_content_binding: {}", e)))?;

        Ok(new_id)
    }

    pub async fn set_other_path_content_binding_unknown<'a, E>(
        executor: &mut E,
        binding_id: &str,
        file_path_id: &str,
    ) -> Result<()>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let now = get_now_date();
        sqlx::query!(
            r#"
            UPDATE file_path_content_binding
               SET match_states = CASE WHEN id = ?1 THEN 'match' ELSE 'unknown' END,
                   updated_at = ?2
             WHERE file_path_id = ?3
            "#,
            binding_id,
            now,
            file_path_id
        )
        .execute(&mut *executor)
        .await?;
        Ok(())
    }

    // -- file path --
    pub async fn insert_file_path<'a, E>(
        executor: &mut E,
        file_info: &FileInfo,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let file_path_id = get_unique_id();
        let now = crate::utils::date::get_now_date();

        let file_path_id: String = sqlx::query_scalar!(
            r#"
            INSERT INTO file_path
                (id, folder_id, file_name, file_name_norm, mtime, is_found, last_seen_at)
            VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(folder_id, file_name_norm) DO UPDATE SET
                file_name    = excluded.file_name,
                mtime        = excluded.mtime,
                is_found   = excluded.is_found,
                last_seen_at = ?7
            RETURNING id as "id!: String"
            "#,
            file_path_id,
            file_info.real_folder_id,
            file_info.file_name,
            file_info.file_name_norm,
            file_info.file_mtime,
            file_info.file_exists,
            now
        )
        .fetch_one(&mut *executor)
        .await
        .map_err(|e| anyhow!(format!("Failed to insert or update file_path: {}", e)))?;

        Ok(file_path_id)
    }

    pub async fn fetch_matched_file_path_ids<'a, E>(
        executor: &mut E,
        file_content_id: &str,
    ) -> Result<Vec<String>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let file_path_ids = sqlx::query_scalar!(
            r#"
            SELECT file_path_id AS "file_path_id!"
            FROM file_path_content_binding
            WHERE file_content_id = ?1 AND is_active = 1 AND match_states = 'match'
            "#,
            file_content_id
        )
        .fetch_all(&mut *executor)
        .await
        .map_err(|e| anyhow!(format!("Failed to fetch active file_path_ids: {}", e)))?;

        Ok(file_path_ids)
    }

    pub async fn fetch_folder_abs_path_cached<'a, E>(
        executor: &mut E,
        folder_id: &str,
    ) -> Result<Option<String>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let abs_path_cached = sqlx::query_scalar!(
            r#"
            SELECT abs_path_cached AS "abs_path_cached!"
            FROM real_folder
            WHERE id = ?1
            "#,
            folder_id
        )
        .fetch_optional(&mut *executor)
        .await
        .map_err(|e| {
            anyhow!(format!("Failed to fetch abs_path_cached: {}", e))
        })?;

        Ok(abs_path_cached)
    }

    pub async fn fetch_file_abs_path_cached<'a, E>(
        executor: &mut E,
        file_path_id: &str,
    ) -> Result<Option<PathBuf>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        struct FilePathRow {
            file_name: String,
            folder_id: String,
        }

        let row: FilePathRow = sqlx::query_as!(
            FilePathRow,
            r#"
            SELECT file_name, folder_id
            FROM file_path
            WHERE id = ?1
        "#,
            file_path_id
        )
        .fetch_one(&mut *executor)
        .await
        .map_err(|e| anyhow!("Failed to fetch file_path: {}", e))?;

        let folder_abs_path = FileRepository::fetch_folder_abs_path_cached(
            executor,
            &row.folder_id,
        )
        .await?;

        if let Some(abs_path_cached) = folder_abs_path {
            let mut final_path = PathBuf::from(abs_path_cached);
            final_path.push(row.file_name);
            return Ok(Some(final_path));
        }

        Ok(None)
    }
}

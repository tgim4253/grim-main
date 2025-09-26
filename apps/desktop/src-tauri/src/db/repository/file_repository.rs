use std::{collections::HashSet, path::PathBuf, str::FromStr};

use anyhow::{anyhow, Result};
use sqlx::{Executor, Row, Sqlite};

use crate::{
    config::file::{IntegrityCheckResult, MatchStates},
    db::repository::node_repository::NodeRepository,
    models::{
        file::{
            FileInfo, FileType, FolderHealthState, NodeFolder, RealFolderData,
        },
        node::{Node, NodeData, NodeKind},
    },
    utils::{date::get_now_date, identifier::get_unique_id},
};

/// Repository for file and folder persistence logic.
pub struct FileRepository;

/// Joined virtual-folder mount information used by services for syncing/options.
#[derive(Debug, Clone)]
pub struct MountWithFolder {
    pub mount_id: String,
    pub virtual_node_id: String,
    pub real_folder_id: String,
    pub recursive: bool,
    pub sync_enabled: bool,
    pub suppress_warnings: bool,
    pub abs_path: Option<String>,
    pub error_flag: crate::config::file::IntegrityCheckResult,
    pub error_msg: Option<String>,
    pub last_seen_scan_id: Option<String>,
    pub last_seen_at: Option<String>,
    pub include_extensions: Vec<String>,
    pub exclude_extensions: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct MountInfo {
    pub virtual_node_id: String,
    pub real_folder_id: String,
    pub recursive: bool,
    pub sync_enabled: bool,
    pub abs_path: Option<String>,
    pub stored_mtime: i64,
    pub include_extensions: Vec<String>,
    pub exclude_extensions: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct FilePathRecord {
    pub id: String,
    pub folder_id: String,
    pub folder_name: Option<String>,
    pub file_name: String,
    pub stored_mtime: Option<i64>,
    pub is_found: bool,
    pub abs_path_cached: Option<String>,
    pub match_state: MatchStates,
}

impl FileRepository {
    fn normalize_extension_vec(list: Vec<String>) -> Vec<String> {
        let mut seen: HashSet<String> = HashSet::new();
        let mut normalized = Vec::new();

        for value in list {
            let trimmed = value.trim().trim_start_matches('.').to_lowercase();
            if trimmed.is_empty() {
                continue;
            }
            if seen.insert(trimmed.clone()) {
                normalized.push(trimmed);
            }
        }

        normalized
    }

    pub(crate) fn decode_extension_list(raw: Option<String>) -> Vec<String> {
        let Some(text) = raw else {
            return Vec::new();
        };

        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Vec::new();
        }

        if let Ok(values) = serde_json::from_str::<Vec<String>>(trimmed) {
            return Self::normalize_extension_vec(values);
        }

        let fallback = trimmed
            .split(',')
            .map(|item| item.trim().to_string())
            .collect::<Vec<_>>();

        Self::normalize_extension_vec(fallback)
    }

    pub(crate) async fn fetch_mounts_rows<'a, E>(
        executor: &mut E,
    ) -> Result<Vec<MountInfo>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        #[derive(sqlx::FromRow)]
        struct MountRow {
            virtual_node_id: String,
            real_folder_id: String,
            sync_enabled: i64,
            abs_path: Option<String>,
            stored_mtime: i64,
            recursive: i64,
            include_glob: Option<String>,
            exclude_glob: Option<String>,
        }

        let rows = sqlx::query_as_unchecked!(
            MountRow,
            r#"
            SELECT
                vfm.virtual_node_id   AS virtual_node_id,
                vfm.real_folder_id    AS real_folder_id,
                vfm.sync_enabled      AS sync_enabled,
                vfm.include_glob      AS include_glob,
                vfm.exclude_glob      AS exclude_glob,
                vfm.recursive         AS recursive,
                rf.abs_path_cached    AS abs_path,
                rf.mtime              AS stored_mtime
            FROM virtual_folder_mount vfm
            JOIN real_folder rf ON rf.id = vfm.real_folder_id
            WHERE vfm.enabled = 1
            "#,
        )
        .fetch_all(&mut *executor)
        .await?;

        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            out.push(MountInfo {
                virtual_node_id: row.virtual_node_id,
                real_folder_id: row.real_folder_id,
                recursive: row.recursive != 0,
                sync_enabled: row.sync_enabled != 0,
                abs_path: row.abs_path,
                stored_mtime: row.stored_mtime,
                include_extensions: Self::decode_extension_list(
                    row.include_glob,
                ),
                exclude_extensions: Self::decode_extension_list(
                    row.exclude_glob,
                ),
            });
        }

        Ok(out)
    }

    pub(crate) async fn fetch_mount_rows<'a, E>(
        executor: &mut E,
        virtual_node_id: &str,
    ) -> Result<Vec<MountWithFolder>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let rows = sqlx::query(
            r#"
            SELECT
                vfm.id                AS mount_id,
                vfm.virtual_node_id   AS virtual_node_id,
                vfm.real_folder_id    AS real_folder_id,
                vfm.recursive         AS recursive,
                vfm.sync_enabled      AS sync_enabled,
                vfm.suppress_warnings AS suppress_warnings,
                vfm.include_glob      AS include_glob,
                vfm.exclude_glob      AS exclude_glob,
                rf.abs_path_cached    AS abs_path,
                rf.error_flag         AS error_flag,
                rf.error_msg          AS error_msg,
                rf.last_seen_scan_id  AS last_seen_scan_id,
                rf.last_seen_at       AS last_seen_at
            FROM virtual_folder_mount vfm
            LEFT JOIN real_folder rf ON rf.id = vfm.real_folder_id
            WHERE vfm.virtual_node_id = ? AND vfm.enabled = 1
            ORDER BY vfm.priority
            "#,
        )
        .bind(virtual_node_id)
        .fetch_all(&mut *executor)
        .await?;

        let mut out = Vec::with_capacity(rows.len());
        for row in rows {
            let error_flag =
                match row.get::<Option<String>, _>("error_flag").as_deref() {
                    Some("notfound") => IntegrityCheckResult::NotFound,
                    Some("mismatch") => IntegrityCheckResult::Mismatch,
                    _ => IntegrityCheckResult::Success,
                };

            out.push(MountWithFolder {
                mount_id: row.get::<String, _>("mount_id"),
                virtual_node_id: row.get::<String, _>("virtual_node_id"),
                real_folder_id: row.get::<String, _>("real_folder_id"),
                recursive: row.get::<i64, _>("recursive") != 0,
                sync_enabled: row.get::<i64, _>("sync_enabled") != 0,
                suppress_warnings: row.get::<i64, _>("suppress_warnings") != 0,
                abs_path: row.get::<Option<String>, _>("abs_path"),
                error_flag,
                error_msg: row.get::<Option<String>, _>("error_msg"),
                last_seen_scan_id: row
                    .get::<Option<String>, _>("last_seen_scan_id"),
                last_seen_at: row.get::<Option<String>, _>("last_seen_at"),
                include_extensions: Self::decode_extension_list(
                    row.get::<Option<String>, _>("include_glob"),
                ),
                exclude_extensions: Self::decode_extension_list(
                    row.get::<Option<String>, _>("exclude_glob"),
                ),
            });
        }

        Ok(out)
    }

    /// Create a mount entry linking a virtual folder node to a real folder.
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
        sqlx::query!(
            r#"
            INSERT INTO virtual_folder_mount
                (id, virtual_node_id, real_folder_id, created_at, enabled, priority, recursive, sync_enabled, suppress_warnings)
            VALUES
                (?1, ?2, ?3, ?4, 1, 0, 1, 0, 0)
            ON CONFLICT(virtual_node_id, real_folder_id) DO NOTHING;
        "#,
            mount_id,
            virtual_node_id,
            real_folder_id,
            now
        )
        .execute(&mut *executor)
        .await?;

        Ok(mount_id)
    }

    /// Fetch mount metadata along with the associated real-folder information.
    pub async fn fetch_mount_for_virtual_node<'a, E>(
        executor: &mut E,
        virtual_node_id: &str,
    ) -> Result<Option<MountWithFolder>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        #[derive(sqlx::FromRow)]
        struct Row {
            mount_id: String,
            real_folder_id: String,
            recursive: i64,
            sync_enabled: i64,
            suppress_warnings: i64,
            abs_path: Option<String>,
            error_flag: Option<String>,
            error_msg: Option<String>,
            last_seen_scan_id: Option<String>,
            last_seen_at: Option<String>,
        }

        let mounts = Self::fetch_mount_rows(executor, virtual_node_id).await?;

        Ok(mounts.into_iter().next())
    }

    /// Update mount options and optionally switch to a different real-folder.
    pub async fn update_mount_options<'a, E>(
        executor: &mut E,
        mount_id: &str,
        new_real_folder_id: Option<&str>,
        recursive: bool,
        sync_enabled: bool,
        suppress_warnings: bool,
        include_extensions: Option<&[String]>,
        exclude_extensions: Option<&[String]>,
    ) -> Result<()>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let recursive = if recursive { 1_i64 } else { 0_i64 };
        let sync_enabled = if sync_enabled { 1_i64 } else { 0_i64 };
        let suppress_warnings = if suppress_warnings { 1_i64 } else { 0_i64 };

        if let Some(new_real_folder_id) = new_real_folder_id {
            sqlx::query!(
                r#"
                    UPDATE virtual_folder_mount
                    SET recursive = ?1,
                        sync_enabled = ?2,
                        suppress_warnings = ?3,
                        real_folder_id = ?4
                    WHERE id = ?5
                "#,
                recursive,
                sync_enabled,
                suppress_warnings,
                new_real_folder_id,
                mount_id
            )
            .execute(&mut *executor)
            .await?;
        } else {
            sqlx::query!(
                r#"
                    UPDATE virtual_folder_mount
                    SET recursive = ?1,
                        sync_enabled = ?2,
                        suppress_warnings = ?3
                    WHERE id = ?4
                "#,
                recursive,
                sync_enabled,
                suppress_warnings,
                mount_id
            )
            .execute(&mut *executor)
            .await?;
        }

        if let Some(include_extensions) = include_extensions {
            if include_extensions.is_empty() {
                sqlx::query!(
                    r#"
                        UPDATE virtual_folder_mount
                        SET include_glob = NULL
                        WHERE id = ?1
                    "#,
                    mount_id
                )
                .execute(&mut *executor)
                .await?;
            } else {
                let encoded = serde_json::to_string(include_extensions)?;
                sqlx::query!(
                    r#"
                        UPDATE virtual_folder_mount
                        SET include_glob = ?1
                        WHERE id = ?2
                    "#,
                    encoded,
                    mount_id
                )
                .execute(&mut *executor)
                .await?;
            }
        }

        if let Some(exclude_extensions) = exclude_extensions {
            if exclude_extensions.is_empty() {
                sqlx::query!(
                    r#"
                        UPDATE virtual_folder_mount
                        SET exclude_glob = NULL
                        WHERE id = ?1
                    "#,
                    mount_id
                )
                .execute(&mut *executor)
                .await?;
            } else {
                let encoded = serde_json::to_string(exclude_extensions)?;
                sqlx::query!(
                    r#"
                        UPDATE virtual_folder_mount
                        SET exclude_glob = ?1
                        WHERE id = ?2
                    "#,
                    encoded,
                    mount_id
                )
                .execute(&mut *executor)
                .await?;
            }
        }

        Ok(())
    }

    /// Look up a real-folder identifier by normalized path components.
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

    /// Create a virtual folder node under the specified parent.
    pub async fn create_virtual_folder<'a, E>(
        executor: &mut E,
        name: String,
        parent_id: String,
    ) -> Result<Node>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        if let Some(folder_node_id) =
            NodeRepository::fetch_folder_node_id_by_name(
                executor,
                name.clone(),
                parent_id.clone(),
            )
            .await?
        {
            let node = NodeRepository::fetch_nodes_by_ids(
                executor,
                vec![folder_node_id.clone()],
            )
            .await?
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("node not found"))?;
            return Ok(node);
        };

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
                mounts: Vec::new(),
                health: FolderHealthState::Normal,
            })),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    /// Upsert metadata for a real folder associated with a storage root.
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

    /// Fetch a file-content identifier by xxHash digest.
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

    /// Upsert file-content metadata and return its identifier.
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

    /// Bind a file path to a file content record, marking it as active.
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

    /// Mark competing file-path bindings as unknown while keeping the winner matched.
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
    /// Upsert a file-path row for the given file information.
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

    /// Fetch active file-path identifiers bound to the provided file content.
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

    /// Retrieve the cached absolute path for a real folder, if available.
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

    /// Resolve the absolute file path for a stored file-path identifier.
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

    /// Load all active file paths bound to the provided file content identifier.
    pub async fn fetch_paths_for_content<'a, E>(
        executor: &mut E,
        file_content_id: &str,
    ) -> Result<Vec<FilePathRecord>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        #[derive(sqlx::FromRow)]
        struct Row {
            file_path_id: String,
            folder_id: String,
            file_name: String,
            mtime: Option<i64>,
            is_found: i64,
            abs_path_cached: Option<String>,
            folder_name: Option<String>,
            match_states: MatchStates,
        }

        let rows = sqlx::query_as!(
            Row,
            r#"
            SELECT
                fp.id                AS "file_path_id!",
                fp.folder_id         AS "folder_id!",
                fp.file_name         AS "file_name!",
                fp.mtime             AS "mtime?",
                fp.is_found          AS "is_found!",
                rf.abs_path_cached   AS "abs_path_cached?",
                rf.name              AS "folder_name?",
                fpcb.match_states    AS "match_states!: MatchStates"
            FROM file_path_content_binding fpcb
            JOIN file_path fp ON fp.id = fpcb.file_path_id
            LEFT JOIN real_folder rf ON rf.id = fp.folder_id
            WHERE fpcb.file_content_id = ?1 AND fpcb.is_active = 1
            ORDER BY fp.updated_at DESC
            "#,
            file_content_id,
        )
        .fetch_all(&mut *executor)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| FilePathRecord {
                id: row.file_path_id,
                folder_id: row.folder_id,
                folder_name: row.folder_name,
                file_name: row.file_name,
                stored_mtime: row.mtime,
                is_found: row.is_found != 0,
                abs_path_cached: row.abs_path_cached,
                match_state: row.match_states,
            })
            .collect())
    }

    /// Remove a file-path row and its bindings.
    pub async fn delete_file_path<'a, E>(
        executor: &mut E,
        file_path_id: &str,
    ) -> Result<()>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        sqlx::query!("DELETE FROM file_path WHERE id = ?1", file_path_id)
            .execute(&mut *executor)
            .await?;

        Ok(())
    }

    pub async fn fetch_file_path_by_info<'a, E>(
        executor: &mut E,
        real_folder_id: &str,
        file_name_norm: &str,

        mtime: i64,
    ) -> Result<Option<String>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let file_path_id = sqlx::query_scalar!(
            r#"
            SELECT id AS "id!"
            FROM file_path
            WHERE folder_id = ?1 AND file_name_norm = ?2 AND mtime = ?3
            "#,
            real_folder_id,
            file_name_norm,
            mtime
        )
        .fetch_optional(&mut *executor)
        .await?;

        Ok(file_path_id)
    }

    pub async fn fetch_file_info<'a, E>(
        executor: &mut E,
        file_path_id: &str,
    ) -> Result<Option<FileInfo>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        #[derive(sqlx::FromRow)]
        struct FileInfoRow {
            file_name: String,
            folder_id: String,
            file_name_norm: String,
            mtime: i64,
            is_found: i64,
            mime: String,
            size: i64,
            xxh3_64: String,
            sha256: Option<String>,
            kind: String,
            display_name: String,
        }

        let Some(file_info_row) = sqlx::query_as_unchecked!(
            FileInfoRow,
            r#"
            SELECT
                fp.file_name,
                fp.folder_id,
                fp.file_name_norm,
                fp.mtime,
                fp.is_found,
                fc.mime,
                fc.size,
                fc.xxh3_64,
                fc.sha256,
                fc.kind,
                fc.display_name
            FROM file_path fp
            JOIN file_path_content_binding fpcb ON fp.id = fpcb.file_path_id
            JOIN file_content fc ON fpcb.file_content_id = fc.id
            WHERE fp.id = ?1 AND fpcb.is_active = 1
            "#,
            file_path_id
        )
        .fetch_optional(&mut *executor)
        .await
        .map_err(|e| {
            anyhow!(
                "Failed to fetch file info for file_path_id {}: {}",
                file_path_id,
                e
            )
        })?
        else {
            return Ok(None);
        };

        Ok(Some(FileInfo {
            real_folder_id: file_info_row.folder_id,
            file_name: file_info_row.file_name,
            file_name_norm: file_info_row.file_name_norm,
            file_mtime: Some(file_info_row.mtime),
            file_exists: file_info_row.is_found != 0,
            mime_guess: file_info_row.mime,
            file_size: Some(file_info_row.size),
            xxh3_64: file_info_row.xxh3_64,
            sha256: file_info_row.sha256,
            kind_guess: FileType::from_str(&file_info_row.kind)?,
        }))
    }
}

use anyhow::Result;
use sqlx::{Executor, Sqlite};

use crate::{
    models::file::StorageRootInfo,
    utils::{date::get_now_date, identifier::get_unique_id},
};

pub struct SrootRepository;

impl SrootRepository {
    pub async fn fetch_mount_path<'a, E>(executor: &mut E, sroot_id: &str) -> Result<Option<String>>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let mount_path: Option<String> = sqlx::query_scalar!(
            r#"
            SELECT mount_path FROM storage_root_mount
            WHERE storage_root_id = ?1
            "#,
            sroot_id
        )
        .fetch_optional(&mut *executor)
        .await?;

        Ok(mount_path)
    }

    pub async fn upsert_storage_root<'a, E>(
        executor: &mut E,
        sroot_info: &crate::models::file::StorageRootInfo,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let new_id = get_unique_id();
        let now = get_now_date();

        let sroot_id = sqlx::query_scalar!(
            r#"
            INSERT INTO storage_root
                (id, platform, stable_id, secondary_id, kind, label, is_available, created_at, updated_at)
            VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(platform, stable_id) DO UPDATE SET
                secondary_id = excluded.secondary_id,
                kind         = excluded.kind,
                label        = excluded.label,
                is_available = excluded.is_available,
                updated_at   = excluded.updated_at
            RETURNING id as "id!: String"
            "#,
            new_id,
            sroot_info.platform,
            sroot_info.stable_id,
            sroot_info.secondary_id,
            sroot_info.kind,
            sroot_info.label,
            sroot_info.is_available,
            now,
            now
        )
        .fetch_one(&mut *executor)
        .await?;

        Ok(sroot_id)
    }

    pub async fn upsert_storage_root_mount<'a, E>(
        executor: &mut E,
        sroot_id: &str,
        mount_path: &str,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let new_id = get_unique_id();
        let now = get_now_date();

        let sroot_mount_id = sqlx::query_scalar!(
            r#"
            INSERT INTO storage_root_mount
                (id, storage_root_id, mount_path, created_at, updated_at)
            VALUES
                (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(storage_root_id, mount_path) DO UPDATE SET
                updated_at   = excluded.updated_at
            RETURNING id as "id!: String"
            "#,
            new_id,
            sroot_id,
            mount_path,
            now,
            now
        )
        .fetch_one(&mut *executor)
        .await?;

        Ok(sroot_mount_id)
    }

    pub async fn ensure_storage_root<'a, E>(
        executor: &mut E,
        sroot_info: &StorageRootInfo,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        // Ensure StorageRoot exists or create it
        let sroot_id = Self::upsert_storage_root(&mut *executor, sroot_info).await?;

        // Ensure StorageRootMount exists or create/update it
        let _sroot_mount_id =
            Self::upsert_storage_root_mount(&mut *executor, &sroot_id, &sroot_info.mount_path)
                .await?;

        Ok(sroot_id)
    }
}

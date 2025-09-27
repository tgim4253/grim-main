use anyhow::Result;
use sqlx::{Executor, Sqlite};

use crate::utils::{date::get_now_date, identifier::get_unique_id};

/// Repository utilities for device persistence.
pub struct DeviceRepository;

impl DeviceRepository {
    /// Ensure a device row exists for the provided UUID and return its identifier.
    pub async fn ensure_device<'a, E>(
        executor: &mut E,
        device_uuid: &str,
        device_name: Option<&str>,
    ) -> Result<String>
    where
        for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
    {
        let new_id = get_unique_id();
        let now = get_now_date();

        let device_id = sqlx::query_scalar!(
            r#"
            INSERT INTO device
                (id, device_uuid, name, created_at, updated_at)
            VALUES
                (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(device_uuid) DO UPDATE SET
                name = COALESCE(excluded.name, name),
                updated_at = excluded.updated_at
            RETURNING id as "id!: String"
            "#,
            new_id,
            device_uuid,
            device_name,
            now,
            now
        )
        .fetch_one(&mut *executor)
        .await?;

        Ok(device_id)
    }
}

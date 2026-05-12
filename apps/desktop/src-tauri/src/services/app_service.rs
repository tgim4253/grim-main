use anyhow::Result;

use crate::models::app::AppStartupState;

const INITIAL_LAUNCH_COMPLETED_KEY: &str = "initial_launch_completed";
const TRUE_VALUE: &str = "true";

#[derive(Clone)]
pub struct AppService {
    pool: sqlx::SqlitePool,
}

fn is_truthy(value: Option<&str>) -> bool {
    matches!(
        value.map(str::trim).map(str::to_ascii_lowercase).as_deref(),
        Some("1" | "true" | "yes" | "on")
    )
}

impl AppService {
    pub fn new(pool: sqlx::SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn load_startup_state(&self) -> Result<AppStartupState> {
        let key = INITIAL_LAUNCH_COMPLETED_KEY;
        let completed_value = sqlx::query_scalar!(
            r#"
            SELECT value
            FROM app_setting
            WHERE key = ?1
            "#,
            key
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(AppStartupState {
            is_initial_launch: !is_truthy(completed_value.as_deref()),
        })
    }

    pub async fn complete_initial_launch(&self) -> Result<()> {
        let key = INITIAL_LAUNCH_COMPLETED_KEY;
        let value = TRUE_VALUE;
        sqlx::query!(
            r#"
            INSERT INTO app_setting (key, value)
            VALUES (?1, ?2)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = datetime('now')
            "#,
            key,
            value
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

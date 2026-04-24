use std::{path::Path, str::FromStr};

use anyhow::{Context, Result};
use sqlx::{
    pool::PoolOptions,
    sqlite::{
        SqliteConnectOptions, SqliteConnection, SqliteJournalMode,
        SqliteSynchronous,
    },
    Pool, Sqlite,
};

use crate::utils::{date::get_now_date, identifier::get_unique_id};

pub(crate) const LIBRARY_ID: &str = "library";

pub async fn open_or_create_db(db_path: &Path) -> Result<Pool<Sqlite>> {
    let options = SqliteConnectOptions::from_str(&format!(
        "sqlite://{}",
        db_path.to_string_lossy()
    ))
    .with_context(|| {
        format!("Failed to parse sqlite URL for {}", db_path.display())
    })?
    .create_if_missing(true)
    .read_only(false)
    .journal_mode(SqliteJournalMode::Wal)
    .synchronous(SqliteSynchronous::Normal)
    .busy_timeout(std::time::Duration::from_secs(15));

    let pool = PoolOptions::new()
        .max_connections(4)
        .after_connect(|conn: &mut SqliteConnection, _meta| {
            Box::pin(async move {
                sqlx::query!("PRAGMA foreign_keys = ON;")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query!("PRAGMA synchronous = NORMAL;")
                    .execute(&mut *conn)
                    .await?;
                Ok::<_, sqlx::Error>(())
            })
        })
        .connect_with(options)
        .await
        .with_context(|| {
            format!("Failed to open/create sqlite at {}", db_path.display())
        })?;

    Ok(pool)
}

pub async fn ensure_schema(pool: &Pool<Sqlite>) -> Result<()> {
    sqlx::migrate!().run(pool).await?;
    Ok(())
}

pub async fn seed_defaults(pool: &Pool<Sqlite>) -> Result<()> {
    let now = get_now_date();
    let now_ref = now.as_str();

    sqlx::query!(
        r#"
        INSERT OR IGNORE INTO library_settings
        (id, active_session_preset_id, croquis_preferences_json, created_at, updated_at)
        VALUES (?1, NULL, NULL, ?2, ?2)
        "#,
        LIBRARY_ID,
        now_ref
    )
    .execute(pool)
    .await?;

    let row =
        sqlx::query!(r#"SELECT COUNT(*) AS "count!: i64" FROM session_preset"#)
            .fetch_one(pool)
            .await?;
    if row.count == 0 {
        let preset_id = get_unique_id();
        let preset_id_ref = preset_id.as_str();
        sqlx::query!(
            r#"
            INSERT INTO session_preset
            (id, name, description, is_default, created_at, updated_at)
            VALUES (?1, 'Quick Croquis', 'Default single-step croquis preset', 1, ?2, ?2)
            "#,
            preset_id_ref,
            now_ref
        )
        .execute(pool)
        .await?;

        let step_id = get_unique_id();
        let step_id_ref = step_id.as_str();
        sqlx::query!(
            r#"
            INSERT INTO session_step_preset
            (id, preset_id, step_order, name, default_duration_seconds, result_required, result_external_path, created_at, updated_at)
            VALUES (?1, ?2, 1, 'Croquis', 180, 0, NULL, ?3, ?3)
            "#,
            step_id_ref,
            preset_id_ref,
            now_ref
        )
        .execute(pool)
        .await?;

        sqlx::query!(
            "UPDATE library_settings SET active_session_preset_id = ?2, updated_at = ?3 WHERE id = ?1",
            LIBRARY_ID,
            preset_id_ref,
            now_ref
        )
        .execute(pool)
        .await?;
    }

    Ok(())
}

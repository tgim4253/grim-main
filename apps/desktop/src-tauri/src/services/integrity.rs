use anyhow::{Context, Result};
use sqlx::{
    pool::PoolOptions,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous},
    Pool, Sqlite,
};
use std::{path::Path, str::FromStr};

/// Open or create DB with a pool and per-connection PRAGMAs.
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
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                sqlx::query("PRAGMA foreign_keys = ON;")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query("PRAGMA journal_mode = WAL;")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query("PRAGMA synchronous = NORMAL;")
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

/// Create tables and indexes defined by the current migration set.
pub async fn ensure_schema(pool: &Pool<Sqlite>) -> Result<()> {
    sqlx::migrate!().run(pool).await?;
    Ok(())
}

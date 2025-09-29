use anyhow::{Context, Result};
use sqlx::{
    pool::PoolOptions,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous},
    Pool, Row, Sqlite,
};
use std::{path::Path, str::FromStr};

use crate::{
    models::connection::RelationType,
    utils::{date::get_now_date, identifier::get_unique_id},
};

/// Desired `PRAGMA user_version` for schema compatibility.
pub const TARGET_DB_VERSION: i32 = 2;

/// Open or create DB with a pool and per-connection PRAGMAs.
pub async fn open_or_create_db(db_path: &Path) -> Result<Pool<Sqlite>> {
    // Build connect options
    let options = SqliteConnectOptions::from_str(
        // Convert the path to a string, replacing any invalid UTF-8 characters with a replacement character
        &format!("sqlite://{}", db_path.to_string_lossy()),
    )
    .with_context(|| {
        format!("Failed to parse sqlite URL for {}", db_path.display())
    })?
    .create_if_missing(true)
    .read_only(false)
    .journal_mode(SqliteJournalMode::Wal)
    .synchronous(SqliteSynchronous::Normal)
    // Avoid 'database is locked' under contention
    .busy_timeout(std::time::Duration::from_secs(15));

    // Small pool by default; tune for your workload
    let pool = PoolOptions::new()
        .max_connections(2)
        // Ensure PRAGMAs are set for every connection in the pool
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                // Enforce FK integrity for this connection
                sqlx::query("PRAGMA foreign_keys = ON;")
                    .execute(&mut *conn)
                    .await?;
                // Journaling and sync are already set above; executing again is harmless.
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

/// Create tables and indexes exactly matching the provided DBML (SQLite dialect).
pub async fn ensure_schema(pool: &Pool<Sqlite>) -> Result<()> {
    sqlx::migrate!().run(pool).await?;

    // let mut tx = pool.begin().await?;

    // for stmt in schema_sql.split(';') {
    //     let trimmed = stmt.trim();
    //     if !trimmed.is_empty() {
    //         sqlx::query(trimmed).execute(&mut *tx).await?;
    //     }
    // }

    // tx.commit().await?;
    Ok(())
}

/// Validate PRAGMA user_version and migrate if necessary.
pub async fn check_version(pool: &Pool<Sqlite>) -> Result<()> {
    // Read user_version
    let ver: i32 = sqlx::query("PRAGMA user_version;")
        .fetch_one(pool)
        .await?
        .get::<i32, _>(0);

    if ver != TARGET_DB_VERSION {
        migrate(pool, ver, TARGET_DB_VERSION).await.with_context(|| {
            format!("Migration from {} to {} failed", ver, TARGET_DB_VERSION)
        })?;
    }

    Ok(())
}

/// Seed initial data if missing.
pub async fn seed_initial_data(pool: &Pool<Sqlite>) -> Result<()> {
    // Run seeding atomically
    let mut tx = pool.begin().await?;
    // Seed connection_kind_rule if empty
    let seed_data = vec![
        (RelationType::ContainsFile, 3, 0, "Folder -> File"),
        (RelationType::BelongToFolder, 3, 0, "File -> Folder"),
        (RelationType::ParentFolder, 3, 0, "Folder(child) -> Folder(parent)"),
        (RelationType::ChildFolder, 1, 0, "Folder(parent) -> Folder(child)"),
        (RelationType::RelativeImage, 3, 0, "File -> File (relative image)"),
        (RelationType::CroquisResLink, 1, 0, "origin -> croquis"),
        (RelationType::CroquisRefLink, 1, 0, "croquis -> origin"),
        (RelationType::Cropped, 1, 0, "origin -> crop"),
        (RelationType::CroppedOrigin, 1, 0, "crop -> origin"),
    ];

    for (kind, default_level, editable, description) in seed_data {
        let id = get_unique_id();
        sqlx::query(
            r#"INSERT OR IGNORE INTO connection_kind_rule
               (id, kind, default_level, editable, description)
               VALUES (?, ?, ?, ?, ?);"#,
        )
        .bind(id)
        .bind(kind)
        .bind(default_level)
        .bind(editable)
        .bind(description)
        .execute(&mut *tx)
        .await?;
    }

    // Seed one root folder node if none exists
    let (has_root,): (i64,) =
        sqlx::query_as(r#"SELECT COUNT(*) FROM node WHERE kind = 'folder';"#)
            .fetch_one(&mut *tx)
            .await?;
    if has_root == 0 {
        let root_id = "root";
        sqlx::query(
            r#"INSERT OR IGNORE INTO node (id, kind, created_at, updated_at)
               VALUES (?1, 'folder', ?2, ?2);"#,
        )
        .bind(&root_id)
        .bind(get_now_date())
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"INSERT OR IGNORE INTO node_folder (id, node_id, display_name, created_at, updated_at)
               VALUES (?1, ?2, 'root', ?3, ?3);"#,
        )
        .bind(&root_id)
        .bind(&root_id)
        .bind(get_now_date())
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// Very basic migration stub using PRAGMA user_version.
async fn migrate(pool: &Pool<Sqlite>, from: i32, to: i32) -> Result<()> {
    if from < to {
        // TODO: apply stepwise DDL changes here; wrap in transaction
        let mut tx = pool.begin().await?;
        sqlx::query(&format!("PRAGMA user_version = {};", to))
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    } else if from > to {
        // Downgrade not supported
        anyhow::bail!(
            "Database version {} is newer than supported {}",
            from,
            to
        );
    } else {
        Ok(())
    }
}

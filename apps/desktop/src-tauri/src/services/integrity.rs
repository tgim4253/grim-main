use anyhow::{Context, Result};
use sqlx::{
    pool::PoolOptions,
    sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteSynchronous},
    Pool, Row, Sqlite,
};
use std::{path::Path, str::FromStr};

use crate::utils::{date::get_now_date, identifier::get_unique_id};

// Desired DB user_version for schema compatibility
pub const TARGET_DB_VERSION: i32 = 1;

/// Open or create DB with a pool and per-connection PRAGMAs.
pub async fn open_or_create_db(db_path: &Path) -> Result<Pool<Sqlite>> {
    // Build connect options
    let options = SqliteConnectOptions::from_str(
        // Convert the path to a string, replacing any invalid UTF-8 characters with a replacement character
        &format!("sqlite://{}", db_path.to_string_lossy()),
    )
    .with_context(|| format!("Failed to parse sqlite URL for {}", db_path.display()))?
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
                sqlx::query("PRAGMA foreign_keys = ON;").execute(&mut *conn).await?;
                // Journaling and sync are already set above; executing again is harmless.
                sqlx::query("PRAGMA journal_mode = WAL;").execute(&mut *conn).await?;
                sqlx::query("PRAGMA synchronous = NORMAL;").execute(&mut *conn).await?;
                Ok::<_, sqlx::Error>(())
            })
        })
        .connect_with(options)
        .await
        .with_context(|| format!("Failed to open/create sqlite at {}", db_path.display()))?;

    Ok(pool)
}

/// Create tables and set initial user_version if needed.
pub async fn ensure_schema(pool: &Pool<Sqlite>) -> Result<()> {
    // Use a transaction for schema setup
    let mut tx = pool.begin().await?;
    /* --------------------------- meta --------------------------- */
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );"#,
    )
    .execute(&mut *tx)
    .await?;

    /* --------------------------- node --------------------------- */
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS node (
            id         TEXT PRIMARY KEY,
            kind       TEXT NOT NULL CHECK (kind IN ('folder','file','tag','annotation','memo')),
            created_at TEXT,
            updated_at TEXT
        );"#,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_node_kind ON node(kind);")
        .execute(&mut *tx)
        .await?;

    /* ------------------------ real_folder ----------------------- */
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS real_folder (
            id         TEXT PRIMARY KEY,
            rel_path   TEXT,
            abs_path   TEXT UNIQUE,
            mtime      INTEGER,
            error_flag TEXT NOT NULL CHECK (error_flag IN ('notfound', 'success', 'mismatch')),
            error_msg  TEXT
        );"#,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_real_folder_error_flag ON real_folder(error_flag);",
    )
    .execute(&mut *tx)
    .await?;

    /* ------------------------ node_folder ----------------------- */
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS node_folder (
            id               TEXT PRIMARY KEY,
            node_id          TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
            real_folder_id   TEXT         REFERENCES real_folder(id) ON DELETE CASCADE,
            name             TEXT
        );"#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_node_folder_node_id ON node_folder(node_id);")
        .execute(&mut *tx)
        .await?;

    /* ----------------------- file_content ----------------------- */
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS file_content (
            id         TEXT PRIMARY KEY,
            node_id    TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
            mime       TEXT,
            size       INTEGER,
            sha256     TEXT UNIQUE NOT NULL
        );"#,
    )
    .execute(&mut *tx)
    .await?;

    /* ------------------------ file_path ------------------------- */
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS file_path (
            id              TEXT PRIMARY KEY,
            folder_id       TEXT NOT NULL REFERENCES real_folder(id) ON DELETE CASCADE,
            file_content_id TEXT NOT NULL REFERENCES file_content(id) ON DELETE CASCADE,
            file_name       TEXT,
            rel_path        TEXT,
            abs_path        TEXT UNIQUE,
            mtime           INTEGER,
            error_flag      TEXT NOT NULL CHECK (error_flag IN ('notfound', 'success', 'mismatch')),
            error_msg       TEXT
        );"#,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_file_path_error_flag ON file_path(error_flag);")
        .execute(&mut *tx)
        .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_file_path_folder_id ON file_path(folder_id);")
        .execute(&mut *tx)
        .await?;

    /* ------------------ connection_kind_rule -------------------- */
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS connection_kind_rule (
            id             TEXT PRIMARY KEY NOT NULL,
            kind           TEXT UNIQUE,
            default_weight INTEGER,
            editable       INTEGER,
            description    TEXT
        );"#,
    )
    .execute(&mut *tx)
    .await?;

    /* ------------------------- connection ----------------------- */
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS connection (
            id           TEXT PRIMARY KEY,
            src_node_id  TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
            dst_node_id  TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
            kind_id      TEXT REFERENCES connection_kind_rule(id) ON DELETE SET NULL,
            UNIQUE (src_node_id, dst_node_id, kind_id)
        );"#,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_connection_src_node_id ON connection(src_node_id);",
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_connection_dst_node_id ON connection(dst_node_id);",
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_connection_src_dst ON connection(src_node_id, dst_node_id);")
        .execute(&mut *tx)
        .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_connection_src_kind ON connection(src_node_id, kind_id);",
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_connection_dst_kind ON connection(dst_node_id, kind_id);",
    )
    .execute(&mut *tx)
    .await?;

    /* --------------------------- tag ---------------------------- */
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS tag (
            id   TEXT PRIMARY KEY,
            name TEXT UNIQUE
        );"#,
    )
    .execute(&mut *tx)
    .await?;

    /* ------------------------- node_tag ------------------------- */
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS node_tag (
            node_id TEXT REFERENCES node(id) ON DELETE CASCADE,
            tag_id  TEXT REFERENCES tag(id) ON DELETE CASCADE,
            PRIMARY KEY (node_id, tag_id)
        );"#,
    )
    .execute(&mut *tx)
    .await?;

    // bump user_version
    sqlx::query(&format!("PRAGMA user_version = {};", TARGET_DB_VERSION)).execute(&mut *tx).await?;

    tx.commit().await?;
    Ok(())
}

/// Validate PRAGMA user_version and migrate if necessary.
pub async fn check_version(pool: &Pool<Sqlite>) -> Result<()> {
    // Read user_version
    let ver: i32 = sqlx::query("PRAGMA user_version;").fetch_one(pool).await?.get::<i32, _>(0);

    if ver != TARGET_DB_VERSION {
        migrate(pool, ver, TARGET_DB_VERSION)
            .await
            .with_context(|| format!("Migration from {} to {} failed", ver, TARGET_DB_VERSION))?;
    }

    Ok(())
}

/// Seed initial data if missing.
pub async fn seed_initial_data(pool: &Pool<Sqlite>) -> Result<()> {
    // Run seeding atomically
    let mut tx = pool.begin().await?;
    // Seed connection_kind_rule if empty
    let (count_rules,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM connection_kind_rule;").fetch_one(&mut *tx).await?;

    if count_rules == 0 {
        // Define seed data without IDs
        let seed_data = vec![
            ("contains", 3, 0, "General reference"),
            ("containedIn", 1, 0, "Folder/file containment"),
        ];

        for (kind, default_weight, editable, description) in seed_data {
            let id = get_unique_id();

            sqlx::query(
                r#"INSERT OR IGNORE INTO connection_kind_rule
                   (id, kind, default_weight, editable, description)
                   VALUES (?1, ?2, ?3, ?4, ?5);"#,
            )
            .bind(id)
            .bind(kind)
            .bind(default_weight)
            .bind(editable)
            .bind(description)
            .execute(&mut *tx)
            .await?;
        }
    }

    // Optionally seed a root folder node if none exists
    let (has_root,): (i64,) = sqlx::query_as(r#"SELECT COUNT(*) FROM node WHERE kind = 'folder';"#)
        .fetch_one(&mut *tx)
        .await?;

    if has_root == 0 {
        let root_id = "root";
        sqlx::query(
            r#"INSERT OR IGNORE INTO node (id, kind, created_at, updated_at)
               VALUES (?1, 'folder', ?2, ?2);
               "#,
        )
        .bind(&root_id)
        .bind(get_now_date())
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"INSERT OR IGNORE INTO node_folder (id, node_id, name)
               VALUES (?1, ?2, 'root');
               "#,
        )
        .bind(&root_id)
        .bind(&root_id)
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
        sqlx::query(&format!("PRAGMA user_version = {};", to)).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    } else if from > to {
        // Downgrade not supported
        anyhow::bail!("Database version {} is newer than supported {}", from, to);
    } else {
        Ok(())
    }
}

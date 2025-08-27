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

/// Create tables and indexes exactly matching the provided DBML (SQLite dialect).
pub async fn ensure_schema(pool: &Pool<Sqlite>) -> Result<()> {
    let mut tx = pool.begin().await?;

    /* --------------------------- node_kind / IntegrityCheckResult (as CHECK) --------------------------- */
    // SQLite has no native ENUM; enforce via CHECKs on columns below.

    /* ------------------------------------ Core graph (virtual) ---------------------------------------- */
    sqlx::query(
        r#"
    CREATE TABLE IF NOT EXISTS node (
      id         TEXT PRIMARY KEY,                               -- uuid
      kind       TEXT NOT NULL CHECK (kind IN ('folder','file','tag','annotation','memo')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_node_kind ON node(kind);"#)
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        r#"
    CREATE TABLE IF NOT EXISTS node_folder (
      id            TEXT PRIMARY KEY,                            -- uuid
      node_id       TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
      display_name  TEXT,
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now')),
      UNIQUE(node_id)
    );
    "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
    CREATE TABLE IF NOT EXISTS tag (
      id   TEXT PRIMARY KEY,                                     -- uuid
      name TEXT UNIQUE
    );
    "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
    CREATE TABLE IF NOT EXISTS node_tag (
      node_id TEXT REFERENCES node(id) ON DELETE CASCADE,
      tag_id  TEXT REFERENCES tag(id) ON DELETE CASCADE,
      PRIMARY KEY (node_id, tag_id)
    );
    "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
    CREATE TABLE IF NOT EXISTS connection_kind_rule (
      id             TEXT PRIMARY KEY NOT NULL,                  -- uuid
      kind           TEXT UNIQUE,                                -- unique identifier
      default_weight INTEGER,
      editable       INTEGER,                                    -- boolean
      description    TEXT
    );
    "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
    CREATE TABLE IF NOT EXISTS connection (
      id           TEXT PRIMARY KEY,                             -- uuid
      src_node_id  TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
      dst_node_id  TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,
      kind_id      TEXT REFERENCES connection_kind_rule(id) ON DELETE SET NULL,
      created_at   TEXT DEFAULT (datetime('now')),
      UNIQUE (src_node_id, dst_node_id, kind_id)
    );
    "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_conn_src        ON connection(src_node_id);"#)
        .execute(&mut *tx)
        .await?;
    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_conn_dst        ON connection(dst_node_id);"#)
        .execute(&mut *tx)
        .await?;
    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_conn_src_dst    ON connection(src_node_id, dst_node_id);"#).execute(&mut *tx).await?;
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_conn_src_kind   ON connection(src_node_id, kind_id);"#,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_conn_dst_kind   ON connection(dst_node_id, kind_id);"#,
    )
    .execute(&mut *tx)
    .await?;

    /* ---------------------------- Storage roots & mounts (portable across OS) -------------------------- */
    sqlx::query(r#"
    CREATE TABLE IF NOT EXISTS storage_root (
      id            TEXT PRIMARY KEY,                             -- uuid
      platform      TEXT,                                         -- 'windows'|'macos'|'linux'|'unknown'
      stable_id     TEXT NOT NULL,                                -- Volume GUID/UUID or //host/share
      secondary_id  TEXT,
      kind          TEXT,                                         -- 'internal'|'external'|'network'
      label         TEXT,
      is_available  INTEGER DEFAULT 0,                            -- boolean
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now')),
      UNIQUE(platform, stable_id)
    );
    "#).execute(&mut *tx).await?;

    sqlx::query(r#"
    CREATE TABLE IF NOT EXISTS storage_root_mount (
      id               TEXT PRIMARY KEY,                          -- uuid
      storage_root_id  TEXT NOT NULL REFERENCES storage_root(id) ON DELETE CASCADE,
      mount_path       TEXT NOT NULL,                             -- 'E:\' | '/Volumes/USB' | '/mnt/share'
      is_primary       INTEGER DEFAULT 1,                          -- boolean
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now')),
      UNIQUE (storage_root_id, mount_path)
    );
    "#).execute(&mut *tx).await?;
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_mount_root ON storage_root_mount(storage_root_id);"#,
    )
    .execute(&mut *tx)
    .await?;

    /* -------------------------------- Real folder tree (physical) ------------------------------------- */
    sqlx::query(r#"
    CREATE TABLE IF NOT EXISTS real_folder (
      id                TEXT PRIMARY KEY,                         -- uuid
      storage_root_id   TEXT REFERENCES storage_root(id) ON DELETE SET NULL,
      parent_id         TEXT REFERENCES real_folder(id) ON DELETE CASCADE,
      name              TEXT NOT NULL,                            -- single segment
      name_norm         TEXT,                                     -- lowercased for case-insensitive FS
      root_rel_path     TEXT,                                     -- optional cache
      abs_path_cached   TEXT,                                     -- optional cache
      mtime             INTEGER,
      error_flag        TEXT CHECK (error_flag IN ('success','notfound','mismatch')),
      error_msg         TEXT,
      last_seen_scan_   TEXT REFERENCES scan_session(id),
      last_seen_at      TEXT,
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now')),
      UNIQUE (storage_root_id, parent_id, name_norm)
    );
    "#).execute(&mut *tx).await?;
    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_real_folder_err ON real_folder(error_flag);"#)
        .execute(&mut *tx)
        .await?;
    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_real_folder_parent ON real_folder(parent_id);"#)
        .execute(&mut *tx)
        .await?;

    /* ---------------------------- File content, paths and binds ------------------------------------ */
    sqlx::query(
        r#"
    CREATE TABLE IF NOT EXISTS file_content (
      id         TEXT PRIMARY KEY,                                  -- uuid
      mime       TEXT,
      size       INTEGER NOT NULL DEFAULT 0 
                    CHECK (size >= 0),
      sha256     TEXT,
      kind       TEXT NOT NULL DEFAULT 'unknown'
                 CHECK (kind IN ('image','video','document','graphictool','audio','archive','unknown')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    "#,
    )
    .execute(&mut *tx)
    .await?;

    // Enforce uniqueness only when sha256 IS NOT NULL
    sqlx::query(
        r#"CREATE UNIQUE INDEX IF NOT EXISTS uq_file_content_sha256_notnull
           ON file_content(sha256) WHERE sha256 IS NOT NULL;"#,
    )
    .execute(&mut *tx)
    .await?;

    // quries by size
    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_file_content_size ON file_content(size);"#)
        .execute(&mut *tx)
        .await?;

    // -- file_path --
    sqlx::query(
        r#"
    CREATE TABLE IF NOT EXISTS file_path (
      id                            TEXT PRIMARY KEY,                          -- uuid
      folder_id                     TEXT NOT NULL REFERENCES real_folder(id) ON DELETE CASCADE,
      file_name                     TEXT NOT NULL,
      file_name_norm                TEXT NOT NULL,
      mtime                         INTEGER CHECK (mtime >= 0),
      is_found                      INTEGER NOT NULL DEFAULT 0,                         -- boolean
      error_msg                     TEXT,
      last_seen_scan_id             TEXT REFERENCES scan_session(id),
      last_seen_at                  TEXT,
      UNIQUE (folder_id, file_name_norm)
    );
    "#,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_file_path_folder_mtime   ON file_path(folder_id, mtime);"#,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_current_file_content    ON file_path(current_file_content_id);"#)
        .execute(&mut *tx)
        .await?;
    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_file_path_err      ON file_path(is_found);"#)
        .execute(&mut *tx)
        .await?;

    // -- binding --
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS file_path_content_binding (
          id              TEXT PRIMARY KEY,                              -- uuid
          file_path_id    TEXT NOT NULL REFERENCES file_path(id) ON DELETE CASCADE,
          file_content_id TEXT NOT NULL REFERENCES file_content(id) ON DELETE CASCADE,

          detected_at     TEXT NOT NULL DEFAULT (datetime('now')),       -- first seen pairing
          resolved_at     TEXT,                                          -- set when version resolution done

          is_active       INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
          
          match_states    TEXT NOT NULL DEFAULT 'unknown' CHECK (match_states IN ('unknown','mismatch','match'))
        );
        "#,
    )
    .execute(&mut *tx)
    .await?;

    // Lookups
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_binding_file_path
           ON file_path_content_binding(file_path_id);"#,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_binding_file_content
           ON file_path_content_binding(file_content_id);"#,
    )
    .execute(&mut *tx)
    .await?;

    // Only one active binding per path (partial unique)
    sqlx::query(
        r#"CREATE UNIQUE INDEX IF NOT EXISTS uq_binding_active_per_path
           ON file_path_content_binding(file_path_id)
           WHERE is_active = 1;"#,
    )
    .execute(&mut *tx)
    .await?;

    // Optional: fast filter & combined match/active filter
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_binding_is_active
           ON file_path_content_binding(is_active);"#,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_binding_match_active
           ON file_path_content_binding(match_states, is_active);"#,
    )
    .execute(&mut *tx)
    .await?;

    /* ------------------------- Virtual mounts & direct node bindings ---------------------------------- */
    sqlx::query(r#"
    CREATE TABLE IF NOT EXISTS virtual_folder_mount (
      id               TEXT PRIMARY KEY,                            -- uuid
      virtual_node_id  TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,  -- must be kind='folder' (enforce by trigger/app)
      real_folder_id   TEXT NOT NULL REFERENCES real_folder(id) ON DELETE CASCADE,
      recursive        INTEGER DEFAULT 1,                           -- boolean
      enabled          INTEGER DEFAULT 1,                           -- boolean
      priority         INTEGER DEFAULT 0,
      include_glob     TEXT,
      exclude_glob     TEXT,
      created_at       TEXT DEFAULT (datetime('now')),
      UNIQUE (virtual_node_id, real_folder_id)
    );
    "#).execute(&mut *tx).await?;
    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_vfm_virtual       ON virtual_folder_mount(virtual_node_id);"#).execute(&mut *tx).await?;
    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_vfm_real          ON virtual_folder_mount(real_folder_id);"#).execute(&mut *tx).await?;
    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_vfm_virtual_prio  ON virtual_folder_mount(virtual_node_id, priority);"#).execute(&mut *tx).await?;

    sqlx::query(
        r#"
    CREATE TABLE IF NOT EXISTS node_file_binding (
      node_id      TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE,       -- node.kind='file'
      file_content_id TEXT NOT NULL REFERENCES file_content(id) ON DELETE CASCADE,
      PRIMARY KEY (node_id, file_content_id)
    );
    "#,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_nfb_filepath ON node_file_binding(file_content_id);"#,
    )
    .execute(&mut *tx)
    .await?;

    /* -------------------------------- Materialization pipeline ---------------------------------------- */
    sqlx::query(r#"
    CREATE TABLE IF NOT EXISTS materialization_target (
      id                 TEXT PRIMARY KEY,                           -- uuid
      name               TEXT NOT NULL,
      dest_real_folder_id TEXT NOT NULL REFERENCES real_folder(id) ON DELETE CASCADE,
      mode               TEXT NOT NULL DEFAULT 'auto',               -- 'auto'|'reflink'|'hardlink'|'symlink'|'copy'
      conflict_policy    TEXT NOT NULL DEFAULT 'rename',             -- 'overwrite'|'skip'|'rename'
      structure_policy   TEXT NOT NULL DEFAULT 'preserve',           -- 'preserve'|'flatten'|'by_tag'
      delete_policy      TEXT NOT NULL DEFAULT 'prune',              -- 'keep'|'prune'
      include_glob       TEXT,
      exclude_glob       TEXT,
      enabled            INTEGER DEFAULT 1,                          -- boolean
      created_at         TEXT DEFAULT (datetime('now'))
    );
    "#).execute(&mut *tx).await?;

    sqlx::query(
        r#"
    CREATE TABLE IF NOT EXISTS materialization_binding (
      id               TEXT PRIMARY KEY,                             -- uuid
      virtual_node_id  TEXT NOT NULL REFERENCES node(id) ON DELETE CASCADE, -- node.kind='folder'
      target_id        TEXT NOT NULL REFERENCES materialization_target(id) ON DELETE CASCADE,
      UNIQUE (virtual_node_id, target_id)
    );
    "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(r#"
    CREATE TABLE IF NOT EXISTS materialization_job (
      id           TEXT PRIMARY KEY,                                 -- uuid
      binding_id   TEXT NOT NULL REFERENCES materialization_binding(id) ON DELETE CASCADE,
      started_at   TEXT DEFAULT (datetime('now')),
      finished_at  TEXT,
      status       TEXT,                                             -- 'running'|'success'|'failed'|'partial'
      stats_json   TEXT,
      error_msg    TEXT
    );
    "#).execute(&mut *tx).await?;

    sqlx::query(r#"
    CREATE TABLE IF NOT EXISTS materialization_map (
      id                           TEXT PRIMARY KEY,                 -- uuid
      binding_id                   TEXT NOT NULL REFERENCES materialization_binding(id) ON DELETE CASCADE,
      src_file_path_id             TEXT NOT NULL REFERENCES file_path(id) ON DELETE CASCADE,
      out_file_path_id             TEXT REFERENCES file_path(id) ON DELETE SET NULL,
      last_materialized_content_id TEXT REFERENCES file_content(id) ON DELETE SET NULL,
      last_job_id                  TEXT REFERENCES materialization_job(id) ON DELETE SET NULL,
      UNIQUE (binding_id, src_file_path_id)
    );
    "#).execute(&mut *tx).await?;

    /* ------------------------------ Anchors & resolvers ----------------------------------------------- */
    sqlx::query(
        r#"
    CREATE TABLE IF NOT EXISTS location_anchor (
      id          TEXT PRIMARY KEY,                                   -- uuid
      name        TEXT NOT NULL UNIQUE,                               -- e.g., 'photos_root'
      description TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      updated_at  TEXT DEFAULT (datetime('now'))
    );
    "#,
    )
    .execute(&mut *tx)
    .await?;

    sqlx::query(r#"
    CREATE TABLE IF NOT EXISTS location_resolver (
      id                TEXT PRIMARY KEY,                             -- uuid
      anchor_id         TEXT NOT NULL REFERENCES location_anchor(id) ON DELETE CASCADE,
      priority          INTEGER DEFAULT 0,
      enabled           INTEGER DEFAULT 1,                            -- boolean
      platform          TEXT,                                         -- 'windows'|'macos'|'linux'|NULL(any)
      strategy          TEXT NOT NULL,                                -- 'relative_to_db'|'storage_root'|'absolute'|'search'
      template          TEXT,                                         -- './Photos' or '/Volumes/USB/Photos'
      storage_stable_id TEXT,                                         -- for 'storage_root'
      marker_uuid       TEXT,                                         -- for 'search' verification
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now'))
    );
    "#).execute(&mut *tx).await?;
    sqlx::query(
        r#"CREATE INDEX IF NOT EXISTS idx_locres_anchor      ON location_resolver(anchor_id);"#,
    )
    .execute(&mut *tx)
    .await?;
    sqlx::query(r#"CREATE INDEX IF NOT EXISTS idx_locres_anchor_prio ON location_resolver(anchor_id, priority);"#)
        .execute(&mut *tx).await?;

    /* --------------------------------- Scanning/session ----------------------------------------------- */
    sqlx::query(
        r#"
    CREATE TABLE IF NOT EXISTS scan_session (
      id          TEXT PRIMARY KEY,                                   -- uuid
      started_at  TEXT DEFAULT (datetime('now')),
      finished_at TEXT,
      note        TEXT
    );
    "#,
    )
    .execute(&mut *tx)
    .await?;

    /* ------------------------------------ PRAGMA user_version ----------------------------------------- */
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
            sqlx::query(
                r#"INSERT OR IGNORE INTO connection_kind_rule
                   (id, kind, default_weight, editable, description)
                   VALUES (?1, ?2, ?3, ?4, ?5);"#,
            )
            .bind(get_unique_id())
            .bind(kind)
            .bind(default_weight)
            .bind(editable)
            .bind(description)
            .execute(&mut *tx)
            .await?;
        }
    }

    // Seed one root folder node if none exists
    let (has_root,): (i64,) = sqlx::query_as(r#"SELECT COUNT(*) FROM node WHERE kind = 'folder';"#)
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

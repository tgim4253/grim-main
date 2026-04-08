use std::{path::PathBuf, sync::Arc};

use anyhow::{anyhow, Result};
use once_cell::sync::OnceCell;
use sqlx::{Pool, Sqlite};
use tauri::{path::BaseDirectory, AppHandle, Manager};
use tokio::{fs, sync::RwLock};

use crate::{
    services::integrity,
    utils::{date::get_now_date, identifier::get_unique_id},
};

use super::LIBRARY_ID;

#[derive(Debug, Clone)]
pub struct LibraryPaths {
    pub asset_dir: PathBuf,
    pub thumb_dir: PathBuf,
    pub tmp_dir: PathBuf,
}

#[derive(Debug, Clone)]
struct LibraryRuntime {
    paths: LibraryPaths,
    pool: Pool<Sqlite>,
}

static LIBRARY_RUNTIME: OnceCell<Arc<LibraryRuntime>> = OnceCell::new();
static INIT_LOCK: OnceCell<Arc<RwLock<()>>> = OnceCell::new();

pub async fn init(app: &AppHandle) -> Result<()> {
    if LIBRARY_RUNTIME.get().is_some() {
        return Ok(());
    }

    let lock = INIT_LOCK.get_or_init(|| Arc::new(RwLock::new(()))).clone();
    let _guard = lock.write().await;

    if LIBRARY_RUNTIME.get().is_some() {
        return Ok(());
    }

    let root_dir = app
        .path()
        .resolve("library", BaseDirectory::AppData)
        .unwrap_or_else(|_| {
            std::env::current_dir()
                .unwrap_or_else(|_| PathBuf::from("."))
                .join("library")
        });
    let db_path = root_dir.join("grim.db");
    let asset_dir = root_dir.join("storage").join("assets");
    let thumb_dir = root_dir.join("storage").join("thumbs");
    let tmp_dir = root_dir.join("storage").join("tmp");

    fs::create_dir_all(&asset_dir).await?;
    fs::create_dir_all(&thumb_dir).await?;
    fs::create_dir_all(&tmp_dir).await?;

    let pool = integrity::open_or_create_db(&db_path).await?;
    integrity::ensure_schema(&pool).await?;

    let runtime = Arc::new(LibraryRuntime {
        paths: LibraryPaths { asset_dir, thumb_dir, tmp_dir },
        pool,
    });

    let _ = LIBRARY_RUNTIME.set(runtime);
    seed_defaults().await?;

    Ok(())
}

pub fn library_paths() -> Result<LibraryPaths> {
    Ok(runtime()?.paths.clone())
}

pub(super) fn pool() -> Result<Pool<Sqlite>> {
    Ok(runtime()?.pool.clone())
}

fn runtime() -> Result<&'static Arc<LibraryRuntime>> {
    LIBRARY_RUNTIME
        .get()
        .ok_or_else(|| anyhow!("Library runtime has not been initialized"))
}

async fn seed_defaults() -> Result<()> {
    let pool = pool()?;
    let now = get_now_date();

    sqlx::query(
        r#"
        INSERT OR IGNORE INTO library_settings
        (id, active_session_preset_id, croquis_preferences_json, created_at, updated_at)
        VALUES (?1, NULL, NULL, ?2, ?2)
        "#,
    )
    .bind(LIBRARY_ID)
    .bind(&now)
    .execute(&pool)
    .await?;

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM session_preset")
        .fetch_one(&pool)
        .await?;
    if count == 0 {
        let preset_id = get_unique_id();
        sqlx::query(
            r#"
            INSERT INTO session_preset
            (id, name, description, is_default, created_at, updated_at)
            VALUES (?1, 'Quick Croquis', 'Default single-step croquis preset', 1, ?2, ?2)
            "#,
        )
        .bind(&preset_id)
        .bind(&now)
        .execute(&pool)
        .await?;

        let step_id = get_unique_id();
        sqlx::query(
            r#"
            INSERT INTO session_step_preset
            (id, preset_id, step_order, name, default_duration_seconds, result_required, created_at, updated_at)
            VALUES (?1, ?2, 1, 'Croquis', 180, 0, ?3, ?3)
            "#,
        )
        .bind(&step_id)
        .bind(&preset_id)
        .bind(&now)
        .execute(&pool)
        .await?;

        sqlx::query(
            "UPDATE library_settings SET active_session_preset_id = ?2, updated_at = ?3 WHERE id = ?1",
        )
        .bind(LIBRARY_ID)
        .bind(&preset_id)
        .bind(&now)
        .execute(&pool)
        .await?;
    }

    Ok(())
}

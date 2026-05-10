pub(crate) mod bootstrap;

#[cfg(debug_assertions)]
const DEV_LIBRARY_DIR_ENV: &str = "GRIM_LIBRARY_DIR";
#[cfg(debug_assertions)]
const DEV_LOCAL_DB_ENV: &str = "GRIM_DEV_LOCAL_DB";

#[derive(Clone)]
pub struct LibraryPaths {
    pub asset_dir: std::path::PathBuf,
    pub thumb_dir: std::path::PathBuf,
    pub tmp_dir: std::path::PathBuf,
}

#[derive(Clone)]
pub struct AppState {
    pub pool: sqlx::SqlitePool,
    pub library_paths: LibraryPaths,
}

impl AppState {
    pub async fn initialize(app: &tauri::AppHandle) -> Result<Self, String> {
        use tokio::fs;

        let root_dir = resolve_library_root_dir(app);
        let db_path = root_dir.join("grim.db");
        let asset_dir = root_dir.join("storage").join("assets");
        let thumb_dir = root_dir.join("storage").join("thumbs");
        let tmp_dir = root_dir.join("storage").join("tmp");

        fs::create_dir_all(&asset_dir)
            .await
            .map_err(|error| error.to_string())?;
        fs::create_dir_all(&thumb_dir)
            .await
            .map_err(|error| error.to_string())?;
        fs::create_dir_all(&tmp_dir)
            .await
            .map_err(|error| error.to_string())?;

        let pool = bootstrap::open_or_create_db(&db_path)
            .await
            .map_err(|error| error.to_string())?;
        bootstrap::ensure_schema(&pool)
            .await
            .map_err(|error| error.to_string())?;
        bootstrap::seed_defaults(&pool)
            .await
            .map_err(|error| error.to_string())?;

        Ok(Self {
            pool,
            library_paths: LibraryPaths { asset_dir, thumb_dir, tmp_dir },
        })
    }
}

fn resolve_library_root_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    if let Some(root_dir) = resolve_debug_library_root_dir() {
        return root_dir;
    }

    use tauri::{path::BaseDirectory, Manager};

    app.path().resolve("library", BaseDirectory::AppData).unwrap_or_else(|_| {
        std::env::current_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .join("library")
    })
}

#[cfg(debug_assertions)]
fn resolve_debug_library_root_dir() -> Option<std::path::PathBuf> {
    if let Ok(root_dir) = std::env::var(DEV_LIBRARY_DIR_ENV) {
        let root_dir = root_dir.trim();
        if !root_dir.is_empty() {
            return Some(resolve_env_path(root_dir));
        }
    }

    env_flag_enabled(DEV_LOCAL_DB_ENV).then(repo_local_library_dir)
}

#[cfg(not(debug_assertions))]
fn resolve_debug_library_root_dir() -> Option<std::path::PathBuf> {
    None
}

#[cfg(debug_assertions)]
fn resolve_env_path(value: &str) -> std::path::PathBuf {
    let path = std::path::PathBuf::from(value);
    if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| std::path::PathBuf::from("."))
            .join(path)
    }
}

#[cfg(debug_assertions)]
fn repo_local_library_dir() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(std::path::Path::parent)
        .and_then(std::path::Path::parent)
        .unwrap_or_else(|| std::path::Path::new(env!("CARGO_MANIFEST_DIR")))
        .join("library")
}

#[cfg(debug_assertions)]
fn env_flag_enabled(name: &str) -> bool {
    std::env::var(name)
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

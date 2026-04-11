pub(crate) mod bootstrap;

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
        use tauri::{path::BaseDirectory, Manager};
        use tokio::fs;

        let root_dir = app
            .path()
            .resolve("library", BaseDirectory::AppData)
            .unwrap_or_else(|_| {
                std::env::current_dir()
                    .unwrap_or_else(|_| std::path::PathBuf::from("."))
                    .join("library")
            });
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

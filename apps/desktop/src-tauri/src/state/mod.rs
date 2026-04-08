use crate::services::library_service;

#[derive(Clone)]
pub struct AppState {
    pub library_paths: library_service::LibraryPaths,
}

impl AppState {
    pub async fn initialize(app: &tauri::AppHandle) -> Result<Self, String> {
        library_service::init(app).await.map_err(|error| error.to_string())?;

        let library_paths = library_service::library_paths()
            .map_err(|error| error.to_string())?;

        Ok(Self { library_paths })
    }
}

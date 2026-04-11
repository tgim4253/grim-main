use anyhow::Result;

use crate::{
    models::settings::LibrarySettings, repositories::SettingsRepository,
};

#[derive(Clone)]
pub struct SettingsService {
    settings_repository: SettingsRepository,
}

impl SettingsService {
    pub fn new(settings_repository: SettingsRepository) -> Self {
        Self { settings_repository }
    }

    pub async fn load_settings(&self) -> Result<LibrarySettings> {
        self.settings_repository.load().await
    }

    pub async fn save_settings(
        &self,
        settings: LibrarySettings,
    ) -> Result<LibrarySettings> {
        self.settings_repository.save(&settings).await
    }
}

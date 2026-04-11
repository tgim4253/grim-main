use anyhow::{Context, Result};
use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::{
    models::{croquis::CroquisPreferences, settings::LibrarySettings},
    state::bootstrap::LIBRARY_ID,
    utils::date::get_now_date,
};

#[derive(Clone)]
pub struct SettingsRepository {
    pool: SqlitePool,
}

impl SettingsRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn begin(&self) -> Result<Transaction<'_, Sqlite>> {
        Ok(self.pool.begin().await?)
    }

    pub async fn load(&self) -> Result<LibrarySettings> {
        let row = sqlx::query!(
            r#"
            SELECT active_session_preset_id, croquis_preferences_json
            FROM library_settings
            WHERE id = ?1
            "#,
            LIBRARY_ID
        )
        .fetch_one(&self.pool)
        .await?;

        let croquis_preferences = row
            .croquis_preferences_json
            .as_deref()
            .map(serde_json::from_str::<CroquisPreferences>)
            .transpose()
            .context("Failed to parse croquis preferences")?;

        Ok(LibrarySettings {
            active_session_preset_id: row.active_session_preset_id,
            croquis_preferences,
        })
    }

    pub async fn save(
        &self,
        settings: &LibrarySettings,
    ) -> Result<LibrarySettings> {
        let now = get_now_date();
        let now_ref = now.as_str();
        let preferences_json = settings
            .croquis_preferences
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .context("Failed to serialize croquis preferences")?;
        let active_session_preset_id =
            settings.active_session_preset_id.as_deref();
        let croquis_preferences_json = preferences_json.as_deref();

        sqlx::query!(
            r#"
            UPDATE library_settings
            SET active_session_preset_id = ?2,
                croquis_preferences_json = ?3,
                updated_at = ?4
            WHERE id = ?1
            "#,
            LIBRARY_ID,
            active_session_preset_id,
            croquis_preferences_json,
            now_ref
        )
        .execute(&self.pool)
        .await?;

        self.load().await
    }

    pub async fn set_active_session_preset_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        preset_id: Option<&str>,
        updated_at: &str,
    ) -> Result<()> {
        sqlx::query!(
            "UPDATE library_settings SET active_session_preset_id = ?2, updated_at = ?3 WHERE id = ?1",
            LIBRARY_ID,
            preset_id,
            updated_at
        )
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    pub async fn load_active_session_preset_id_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
    ) -> Result<Option<String>> {
        Ok(sqlx::query_scalar!(
            "SELECT active_session_preset_id FROM library_settings WHERE id = ?1",
            LIBRARY_ID
        )
        .fetch_optional(&mut **tx)
        .await?
        .flatten())
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::{
        models::croquis::CroquisPreferences,
        state::bootstrap::{ensure_schema, open_or_create_db, seed_defaults},
    };

    use super::SettingsRepository;

    fn make_temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "grim-settings-repo-{prefix}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("failed to create temp dir");
        dir
    }

    #[tokio::test]
    async fn load_and_save_settings_round_trip() {
        let dir = make_temp_dir("round-trip");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

        let repo = SettingsRepository::new(pool);
        let mut settings = repo.load().await.expect("failed to load settings");
        assert!(settings.active_session_preset_id.is_some());

        settings.croquis_preferences = Some(CroquisPreferences {
            presets: Vec::new(),
            active_preset_id: "focus".to_string(),
        });
        let saved =
            repo.save(&settings).await.expect("failed to save settings");

        assert_eq!(
            saved
                .croquis_preferences
                .as_ref()
                .map(|prefs| prefs.active_preset_id.as_str()),
            Some("focus")
        );

        let _ = fs::remove_dir_all(dir);
    }
}

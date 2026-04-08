use anyhow::{Context, Result};
use sqlx::Row;

use crate::models::{
    croquis::CroquisPreferences,
    library::{ExplorerSnapshot, LibrarySettings, LibrarySnapshot},
};

use super::{
    assets::{count_all_assets, count_uncategorized_assets},
    folders::load_virtual_folders,
    records::list_recent_records,
    runtime::pool,
    sessions::{list_recent_sessions, list_session_presets},
    tags::{list_tag_groups, list_tags},
    LIBRARY_ID,
};

pub async fn load_settings() -> Result<LibrarySettings> {
    let pool = pool()?;
    let row = sqlx::query(
        r#"
        SELECT active_session_preset_id, croquis_preferences_json
        FROM library_settings
        WHERE id = ?1
        "#,
    )
    .bind(LIBRARY_ID)
    .fetch_one(&pool)
    .await?;

    let preferences_json: Option<String> =
        row.try_get("croquis_preferences_json")?;
    let croquis_preferences = preferences_json
        .as_deref()
        .map(serde_json::from_str::<CroquisPreferences>)
        .transpose()
        .context("Failed to parse croquis preferences")?;

    Ok(LibrarySettings {
        active_session_preset_id: row.try_get("active_session_preset_id")?,
        croquis_preferences,
    })
}

pub async fn save_settings(
    settings: LibrarySettings,
) -> Result<LibrarySettings> {
    let pool = pool()?;
    let now = crate::utils::date::get_now_date();
    let preferences_json = settings
        .croquis_preferences
        .as_ref()
        .map(serde_json::to_string)
        .transpose()
        .context("Failed to serialize croquis preferences")?;

    sqlx::query(
        r#"
        UPDATE library_settings
        SET active_session_preset_id = ?2,
            croquis_preferences_json = ?3,
            updated_at = ?4
        WHERE id = ?1
        "#,
    )
    .bind(LIBRARY_ID)
    .bind(settings.active_session_preset_id.as_deref())
    .bind(preferences_json.as_deref())
    .bind(&now)
    .execute(&pool)
    .await?;

    load_settings().await
}

pub async fn load_snapshot() -> Result<LibrarySnapshot> {
    let settings = load_settings().await?;
    let explorer = ExplorerSnapshot {
        virtual_folders: load_virtual_folders().await?,
        all_assets_count: count_all_assets().await?,
        uncategorized_count: count_uncategorized_assets().await?,
        recent_records: list_recent_records(12).await?,
        recent_sessions: list_recent_sessions(12).await?,
    };
    let session_presets = list_session_presets().await?;
    let tag_groups = list_tag_groups().await?;
    let tags = list_tags().await?;

    Ok(LibrarySnapshot {
        settings,
        explorer,
        session_presets,
        tag_groups,
        tags,
    })
}

use std::{collections::HashMap, path::PathBuf};

use anyhow::{anyhow, bail, Result};
use once_cell::sync::Lazy;
use tokio::sync::RwLock;

use crate::{
    app_launcher,
    models::croquis::{
        CroquisPreferences, CroquisSession, CroquisSessionItem,
        CroquisStartPayload, CroquisStartResponse,
    },
    services::{library_service, media_service},
    state::AppState,
    utils::date::get_now_date,
};

/// In-memory registry of active Croquis sessions keyed by session identifier.
static CROQUIS_SESSIONS: Lazy<RwLock<HashMap<String, CroquisSession>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

#[derive(Clone, Default)]
pub struct CroquisService;

impl CroquisService {
    pub fn new(
        _app_state: AppState,
        _library_service: crate::services::LibraryService,
    ) -> Self {
        Self
    }

    pub async fn start_session(
        &self,
        app_handle: &tauri::AppHandle,
        payload: CroquisStartPayload,
    ) -> Result<CroquisStartResponse> {
        start_session(app_handle, payload).await
    }

    pub async fn load_session(
        &self,
        session_id: &str,
    ) -> Option<CroquisSession> {
        load_session(session_id).await
    }

    pub async fn load_preferences(&self) -> Result<Option<CroquisPreferences>> {
        load_preferences().await
    }

    pub async fn save_preferences(
        &self,
        preferences: &CroquisPreferences,
    ) -> Result<CroquisPreferences> {
        save_preferences(preferences).await
    }
}

fn build_session_title(preset_name: &str) -> String {
    format!("{preset_name} · {}", chrono::Local::now().format("%Y-%m-%d %H:%M"))
}

fn asset_source_path(
    asset: &crate::models::library::AssetSummary,
) -> Result<PathBuf> {
    library_service::resolve_asset_source_path(asset)
        .ok_or_else(|| anyhow!("Asset {} has no source path", asset.id))
}

/// Launch a new Croquis session by ensuring base images and spawning the window.
pub async fn start_session(
    app_handle: &tauri::AppHandle,
    payload: CroquisStartPayload,
) -> Result<CroquisStartResponse> {
    let CroquisStartPayload {
        asset_ids,
        preset_id,
        option,
        save_option,
        preferences,
    } = payload;

    if asset_ids.is_empty() {
        bail!("At least one asset must be selected to start Croquis");
    }

    let preset =
        library_service::load_session_preset(preset_id.as_deref()).await?;
    if preset.steps.is_empty() {
        bail!("Selected session preset does not have any steps");
    }

    if save_option {
        let mut settings = library_service::load_settings().await?;
        settings.active_session_preset_id = Some(preset.id.clone());
        if let Some(next_preferences) = preferences.clone() {
            settings.croquis_preferences = Some(next_preferences);
        }
        let _ = library_service::save_settings(settings).await?;
    }

    let assets = library_service::load_assets_by_ids(&asset_ids).await?;
    let session_title = build_session_title(&preset.name);
    let session_id =
        library_service::create_session(&session_title, Some(&preset.id))
            .await?;

    let mut items = Vec::new();
    for asset in &assets {
        let source_path = asset_source_path(asset)?;
        if !media_service::is_supported_image(&source_path) {
            continue;
        }

        let hash = match asset.hash.clone() {
            Some(value) => Some(value),
            None => Some(media_service::hash_file(&source_path).await?),
        };
        let hash_value = hash.clone().unwrap_or_default();
        let thumb_path =
            asset.thumbnail_path.clone().map(PathBuf::from).unwrap_or_else(
                || {
                    let paths = library_service::library_paths()
                        .expect("library paths should be available");
                    media_service::thumbnail_path(&paths.thumb_dir, &hash_value)
                },
            );
        let (thumb_width, thumb_height) =
            media_service::ensure_thumbnail(&source_path, &thumb_path).await?;

        for step in &preset.steps {
            let record_title = format!("{} · {}", asset.file_name, step.name);
            let record = library_service::create_session_record(
                &asset.id,
                &session_id,
                step,
                &record_title,
            )
            .await?;
            items.push(CroquisSessionItem {
                record_id: record.id,
                asset_id: asset.id.clone(),
                file_name: asset.file_name.clone(),
                hash: hash.clone(),
                base_path: thumb_path.to_string_lossy().into_owned(),
                base_width: thumb_width,
                base_height: thumb_height,
                source_path: source_path.to_string_lossy().into_owned(),
                step_name: step.name.clone(),
                step_index: step.step_order,
                target_duration_seconds: step.default_duration_seconds,
            });
        }
    }

    if items.is_empty() {
        bail!("No valid image assets were available for this Croquis session");
    }

    let session = CroquisSession {
        session_id: session_id.clone(),
        title: session_title,
        option,
        preset,
        items,
        created_at: get_now_date(),
    };

    let window_label =
        app_launcher::croquis::launch_croquis(app_handle, &session)
            .map_err(anyhow::Error::msg)?;

    {
        let mut sessions = CROQUIS_SESSIONS.write().await;
        sessions.insert(session_id.clone(), session);
    }

    Ok(CroquisStartResponse { session_id, window_label })
}

/// Fetch a previously created Croquis session by identifier.
pub async fn load_session(session_id: &str) -> Option<CroquisSession> {
    let sessions = CROQUIS_SESSIONS.read().await;
    sessions.get(session_id).cloned()
}

pub async fn load_preferences() -> Result<Option<CroquisPreferences>> {
    Ok(library_service::load_settings().await?.croquis_preferences)
}

pub async fn save_preferences(
    preferences: &CroquisPreferences,
) -> Result<CroquisPreferences> {
    let mut settings = library_service::load_settings().await?;
    settings.croquis_preferences = Some(preferences.clone());
    let saved = library_service::save_settings(settings).await?;
    Ok(saved.croquis_preferences.unwrap_or_else(|| preferences.clone()))
}

use std::collections::HashMap;

use anyhow::{anyhow, bail, Result};
use once_cell::sync::Lazy;
use tokio::sync::RwLock;

use crate::{
    app_launcher,
    models::croquis::{
        CroquisRuntimeStep, CroquisSession, CroquisSessionItem,
        CroquisStartPayload, CroquisStartResponse,
    },
    services::{AssetService, LibraryStorage},
    utils::{date::get_now_date, identifier::get_unique_id, media},
};

/// In-memory registry of active Croquis sessions keyed by session identifier.
static CROQUIS_SESSIONS: Lazy<RwLock<HashMap<String, CroquisSession>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

struct PreparedCroquisItem {
    asset_id: String,
    file_name: String,
    hash: String,
    base_path: String,
    base_width: u32,
    base_height: u32,
    source_path: String,
    step_name: String,
    step_index: i64,
    target_duration_seconds: Option<i64>,
    auto_advance: bool,
    record_save_enabled: bool,
    capture_enabled: bool,
    grayscale_enabled: bool,
    result_required: bool,
    result_save_path: Option<String>,
    tag_ids: Vec<String>,
}

#[derive(Clone)]
pub struct CroquisService {
    asset_service: AssetService,
    library_storage: LibraryStorage,
}

impl CroquisService {
    pub fn new(
        asset_service: AssetService,
        library_storage: LibraryStorage,
    ) -> Self {
        Self { asset_service, library_storage }
    }

    pub async fn start_session(
        &self,
        app_handle: &tauri::AppHandle,
        payload: CroquisStartPayload,
    ) -> Result<CroquisStartResponse> {
        self.start_session_inner(app_handle, payload).await
    }

    pub async fn take_session(
        &self,
        session_id: &str,
    ) -> Option<CroquisSession> {
        take_session(session_id).await
    }

    async fn start_session_inner(
        &self,
        app_handle: &tauri::AppHandle,
        payload: CroquisStartPayload,
    ) -> Result<CroquisStartResponse> {
        let CroquisStartPayload {
            asset_ids,
            preset_id,
            preset_name,
            window_width,
            window_height,
            is_shuffle,
            steps,
        } = payload;

        let items = self.prepare_session_items(&asset_ids, &steps).await?;
        let session_title = build_session_title(&preset_name);
        let session_id = get_unique_id();

        let session = CroquisSession {
            session_id: session_id.clone(),
            title: session_title,
            preset_id,
            preset_name,
            window_width,
            window_height,
            is_shuffle,
            items,
            created_at: get_now_date(),
        };

        {
            let mut sessions = CROQUIS_SESSIONS.write().await;
            sessions.insert(session_id.clone(), session.clone());
        }

        let window_label =
            match app_launcher::croquis::launch_croquis(app_handle, &session) {
                Ok(window_label) => window_label,
                Err(error) => {
                    let mut sessions = CROQUIS_SESSIONS.write().await;
                    sessions.remove(&session_id);
                    return Err(anyhow::Error::msg(error));
                }
            };

        Ok(CroquisStartResponse { session_id, window_label })
    }

    async fn prepare_session_items(
        &self,
        asset_ids: &[String],
        steps: &[CroquisRuntimeStep],
    ) -> Result<Vec<CroquisSessionItem>> {
        if asset_ids.is_empty() {
            bail!("At least one asset must be selected to start Croquis");
        }

        if steps.is_empty() {
            bail!("Selected session preset does not have any steps");
        }

        let assets = self.asset_service.load_assets_by_ids(asset_ids).await?;
        let mut prepared_items = Vec::new();
        for asset in &assets {
            let source_path = self
                .asset_service
                .resolve_asset_source_path(asset)
                .ok_or_else(|| {
                    anyhow!("Asset {} has no source path", asset.id)
                })?;
            if !media::is_supported_image(&source_path) {
                continue;
            }

            let hash_value = asset.hash.clone();
            let thumb_path = self.library_storage.thumbnail_path(&hash_value);
            let (thumb_width, thumb_height) =
                media::ensure_thumbnail(&source_path, &thumb_path).await?;

            for step in steps {
                prepared_items.push(PreparedCroquisItem {
                    asset_id: asset.id.clone(),
                    file_name: asset.file_name.clone(),
                    hash: hash_value.clone(),
                    base_path: thumb_path.to_string_lossy().into_owned(),
                    base_width: thumb_width,
                    base_height: thumb_height,
                    source_path: source_path.to_string_lossy().into_owned(),
                    step_name: step.name.clone(),
                    step_index: step.step_order,
                    target_duration_seconds: step.default_duration_seconds,
                    auto_advance: step.auto_advance,
                    record_save_enabled: step.record_save_enabled,
                    capture_enabled: step.capture_enabled,
                    grayscale_enabled: step.grayscale_enabled,
                    result_required: step.result_required,
                    result_save_path: step.result_save_path.clone(),
                    tag_ids: step.tag_ids.clone(),
                });
            }
        }

        if prepared_items.is_empty() {
            bail!(
                "No valid image assets were available for this Croquis session"
            );
        }

        let mut items = Vec::with_capacity(prepared_items.len());
        for prepared_item in prepared_items {
            let title = format!(
                "{} · {}",
                prepared_item.file_name, prepared_item.step_name
            );
            items.push(CroquisSessionItem {
                item_id: get_unique_id(),
                record_id: None,
                asset_id: prepared_item.asset_id,
                title,
                tag_ids: prepared_item.tag_ids,
                file_name: prepared_item.file_name,
                hash: prepared_item.hash,
                base_path: prepared_item.base_path,
                base_width: prepared_item.base_width,
                base_height: prepared_item.base_height,
                source_path: prepared_item.source_path,
                step_name: prepared_item.step_name,
                step_index: prepared_item.step_index,
                target_duration_seconds: prepared_item.target_duration_seconds,
                auto_advance: prepared_item.auto_advance,
                record_save_enabled: prepared_item.record_save_enabled,
                capture_enabled: prepared_item.capture_enabled,
                grayscale_enabled: prepared_item.grayscale_enabled,
                result_required: prepared_item.result_required,
                result_save_path: prepared_item.result_save_path,
            });
        }

        Ok(items)
    }
}

fn build_session_title(preset_name: &str) -> String {
    format!("{preset_name} · {}", chrono::Local::now().format("%Y-%m-%d %H:%M"))
}

/// Take a previously created Croquis session by identifier.
pub async fn take_session(session_id: &str) -> Option<CroquisSession> {
    let mut sessions = CROQUIS_SESSIONS.write().await;
    sessions.remove(session_id)
}

#[cfg(test)]
mod tests {
    use super::{take_session, CroquisSession, CROQUIS_SESSIONS};

    #[tokio::test]
    async fn take_session_consumes_entry() {
        let session = CroquisSession {
            session_id: "session-1".to_string(),
            title: "Test Session".to_string(),
            preset_id: "preset-1".to_string(),
            preset_name: "Preset".to_string(),
            window_width: Some("960".to_string()),
            window_height: None,
            is_shuffle: false,
            items: Vec::new(),
            created_at: "2026-04-11T00:00:00Z".to_string(),
        };

        {
            let mut sessions = CROQUIS_SESSIONS.write().await;
            sessions.clear();
            sessions.insert(session.session_id.clone(), session.clone());
        }

        let first = take_session(&session.session_id).await;
        let second = take_session(&session.session_id).await;

        assert_eq!(
            first.map(|entry| entry.session_id),
            Some(session.session_id)
        );
        assert!(second.is_none());
    }
}

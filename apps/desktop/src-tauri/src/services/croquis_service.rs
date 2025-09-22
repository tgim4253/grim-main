use std::collections::HashMap;

use anyhow::{anyhow, bail, Context, Result};
use once_cell::sync::Lazy;
use tokio::{fs, sync::RwLock};
use tracing::warn;

use crate::{
    app_launcher,
    bootstrap::PATH_MANAGER,
    models::croquis::{
        CroquisOption, CroquisSession, CroquisSessionImage,
        CroquisStartPayload, CroquisStartResponse,
    },
    services::file_service::{
        folder::fetch_one_file_path,
        thumbnail::{ensure_base_thumbnail, BaseThumbInfo},
    },
    utils::{date, identifier::get_unique_id},
};

/// In-memory registry of active Croquis sessions keyed by session identifier.
static CROQUIS_SESSIONS: Lazy<RwLock<HashMap<String, CroquisSession>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

/// Launch a new Croquis session by ensuring base images and spawning the window.
pub async fn start_session(
    app_handle: &tauri::AppHandle,
    payload: CroquisStartPayload,
) -> Result<CroquisStartResponse> {
    let CroquisStartPayload { moa_id, option, image_hashes, save_option } =
        payload;

    if image_hashes.is_empty() {
        bail!("At least one image hash must be provided to start Croquis");
    }

    if save_option {
        persist_option(&moa_id, &option).await?;
    }

    let mut images: Vec<CroquisSessionImage> =
        Vec::with_capacity(image_hashes.len());

    for hash in &image_hashes {
        let source_path = match fetch_one_file_path(
            moa_id.clone(),
            hash.clone(),
        )
        .await
        {
            Ok(path) => path,
            Err(error) => {
                warn!(
                    error = ?error,
                    %hash,
                    "Failed to resolve source path for Croquis hash; skipping"
                );
                continue;
            }
        };

        let BaseThumbInfo { path, width, height } = match ensure_base_thumbnail(
            app_handle,
            &moa_id,
            hash,
            source_path.as_path(),
        )
        .await
        {
            Ok(info) => info,
            Err(error) => {
                warn!(
                    error = ?error,
                    %hash,
                    "Failed to ensure base thumbnail for Croquis hash; skipping"
                );
                continue;
            }
        };

        images.push(CroquisSessionImage {
            hash: hash.clone(),
            base_path: path.as_path().to_string_lossy().into_owned(),
            base_width: width,
            base_height: height,
            source_path: source_path.to_string_lossy().into_owned(),
        });
    }

    if images.is_empty() {
        bail!("None of the provided image hashes could be loaded for Croquis");
    }

    let session_id = get_unique_id();
    let created_at = date::get_now_date();
    let session = CroquisSession {
        session_id: session_id.clone(),
        moa_id: moa_id.clone(),
        option: option.clone(),
        images,
        created_at,
    };

    let window_label =
        app_launcher::croquis::launch_croquis(app_handle, &session)
            .map_err(|err| anyhow!(err))?;

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

/// Persist the Croquis option payload into the workspace `.moa/settings` folder.
async fn persist_option(moa_id: &str, option: &CroquisOption) -> Result<()> {
    let paths = PATH_MANAGER
        .get_or_add(moa_id)
        .await
        .context("Failed to resolve workspace paths")?;

    let settings_dir = paths.moa_dir.join("settings");
    fs::create_dir_all(&settings_dir).await.with_context(|| {
        format!(
            "Failed to create settings directory at {}",
            settings_dir.display()
        )
    })?;

    let file_path = settings_dir.join("croquis.json");
    let payload = serde_json::to_vec_pretty(option)
        .context("Failed to serialise Croquis options")?;

    fs::write(&file_path, payload).await.with_context(|| {
        format!("Failed to write Croquis options to {}", file_path.display())
    })?;

    Ok(())
}

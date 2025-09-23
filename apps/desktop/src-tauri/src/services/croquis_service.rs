use std::{collections::HashMap, io::ErrorKind, path::PathBuf, time::Duration};

use anyhow::{anyhow, bail, Context, Result};
use image::{ColorType, ImageFormat};
use once_cell::sync::Lazy;
use screenshots::Screen;
use tauri::Manager;
use tokio::{fs, sync::RwLock, time::sleep};
use tracing::warn;

use crate::{
    app_launcher,
    bootstrap::PATH_MANAGER,
    db::repository::{
        connection_repository::ConnectionRepository,
        file_repository::FileRepository, node_repository::NodeRepository,
    },
    models::connection::RelationType,
    models::croquis::{
        CroquisCaptureConfirmResponse, CroquisCaptureContext,
        CroquisCaptureMonitor, CroquisCapturePreview,
        CroquisCapturePreviewPayload, CroquisCaptureRect,
        CroquisCaptureStartPayload, CroquisCaptureStartResponse, CroquisOption,
        CroquisSession, CroquisSessionImage, CroquisStartPayload,
        CroquisStartResponse,
    },
    models::file::{FileInfo, FileType},
    services::file_service::{
        folder::fetch_one_file_path,
        job_queue::{enqueue_base_job, BaseThumbnailJob},
        thumbnail::{ensure_base_thumbnail, BaseThumbInfo},
    },
    services::{db::DB_MANAGER, storage_root},
    utils::{date, identifier::get_unique_id, path_utils::normalize_path},
};

/// In-memory registry of active Croquis sessions keyed by session identifier.
static CROQUIS_SESSIONS: Lazy<RwLock<HashMap<String, CroquisSession>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

#[derive(Debug, Clone)]
struct CroquisCaptureState {
    capture_id: String,
    session_id: String,
    image_hash: String,
    moa_id: String,
    save_dir: PathBuf,
    window_label: String,
    preview_path: Option<PathBuf>,
}

/// Currently active capture request (only one supported at a time).
static ACTIVE_CAPTURE: Lazy<RwLock<Option<CroquisCaptureState>>> =
    Lazy::new(|| RwLock::new(None));

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

/// Load the persisted Croquis option payload from the workspace settings directory.
pub async fn load_option(moa_id: &str) -> Result<Option<CroquisOption>> {
    let paths = PATH_MANAGER
        .get_or_add(moa_id)
        .await
        .context("Failed to resolve workspace paths")?;

    let settings_dir = paths.moa_dir.join("settings");
    let file_path = settings_dir.join("croquis.json");

    match fs::read(&file_path).await {
        Ok(payload) => {
            let option = serde_json::from_slice(&payload)
                .context("Failed to deserialise Croquis options")?;
            Ok(Some(option))
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error).with_context(|| {
            format!(
                "Failed to read Croquis options from {}",
                file_path.display()
            )
        }),
    }
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

/// Begin a capture flow by launching the overlay window for the current Croquis session.
pub async fn start_capture(
    app_handle: &tauri::AppHandle,
    payload: CroquisCaptureStartPayload,
) -> Result<CroquisCaptureStartResponse> {
    let CroquisCaptureStartPayload { session_id, image_hash } = payload;

    let session = {
        let sessions = CROQUIS_SESSIONS.read().await;
        sessions
            .get(&session_id)
            .cloned()
            .ok_or_else(|| anyhow!("Croquis session not found for capture"))?
    };

    if session.option.save_path.trim().is_empty() {
        bail!("Croquis capture save path is not configured");
    }

    let save_dir = PathBuf::from(session.option.save_path.trim());
    fs::create_dir_all(&save_dir).await.with_context(|| {
        format!("Failed to create capture directory at {}", save_dir.display())
    })?;

    let Some(_target_image) =
        session.images.iter().find(|img| img.hash == image_hash)
    else {
        bail!("Requested image hash is not part of the Croquis session");
    };

    {
        let active = ACTIVE_CAPTURE.read().await;
        if active.is_some() {
            bail!("Another capture is currently in progress");
        }
    }

    let capture_id = get_unique_id();
    let window_label =
        app_launcher::croquis::launch_croquis_capture(app_handle, &capture_id)
            .map_err(|err| anyhow!(err))?;

    {
        let mut guard = ACTIVE_CAPTURE.write().await;
        *guard = Some(CroquisCaptureState {
            capture_id: capture_id.clone(),
            session_id: session_id.clone(),
            image_hash: image_hash.clone(),
            moa_id: session.moa_id.clone(),
            save_dir: save_dir.clone(),
            window_label,
            preview_path: None,
        });
    }

    Ok(CroquisCaptureStartResponse { capture_id })
}

/// Load the active capture context for the overlay window.
pub async fn load_capture_context(
    capture_id: &str,
) -> Option<CroquisCaptureContext> {
    let guard = ACTIVE_CAPTURE.read().await;
    let state = guard.as_ref()?;
    if state.capture_id != capture_id {
        return None;
    }

    Some(CroquisCaptureContext {
        capture_id: state.capture_id.clone(),
        session_id: state.session_id.clone(),
        image_hash: state.image_hash.clone(),
        moa_id: state.moa_id.clone(),
        save_path: state.save_dir.to_string_lossy().into_owned(),
    })
}

/// Render a preview for the selected screen region by capturing and cropping the display.
pub async fn render_capture_preview(
    app_handle: &tauri::AppHandle,
    payload: CroquisCapturePreviewPayload,
) -> Result<CroquisCapturePreview> {
    let CroquisCapturePreviewPayload { capture_id, rect, monitor } = payload;

    if rect.width == 0 || rect.height == 0 {
        bail!("Capture rectangle must be greater than zero");
    }

    let (state_snapshot, previous_preview) = {
        let guard = ACTIVE_CAPTURE.read().await;
        let state = guard
            .as_ref()
            .ok_or_else(|| anyhow!("No active capture session"))?;
        if state.capture_id != capture_id {
            bail!("Capture session does not match active request");
        }
        (state.clone(), state.preview_path.clone())
    };

    let paths = PATH_MANAGER
        .get_or_add(&state_snapshot.moa_id)
        .await
        .context("Failed to resolve workspace paths for capture")?;
    let preview_dir = paths.cached_dir.join("croquis").join("captures");
    fs::create_dir_all(&preview_dir).await.with_context(|| {
        format!(
            "Failed to create capture preview directory at {}",
            preview_dir.display()
        )
    })?;

    if let Some(prev) = previous_preview {
        let _ = fs::remove_file(prev).await;
    }

    let preview_path = preview_dir.join(format!("{}_preview.png", capture_id));

    if let Some(window) =
        app_handle.get_webview_window(&state_snapshot.window_label)
    {
        let _ = window.hide();
        // Give the compositor a moment to remove the overlay from the screen before capturing.
        sleep(Duration::from_millis(120)).await;
    }

    let monitor_clone = monitor;
    let rect_clone = rect;
    let out_path = preview_path.clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<()> {
        capture_region(&monitor_clone, &rect_clone, &out_path)
    })
    .await
    .map_err(|err| anyhow!("Capture task join error: {err}"))??;

    if let Some(window) =
        app_handle.get_webview_window(&state_snapshot.window_label)
    {
        let _ = window.show();
        let _ = window.set_focus();
    }

    {
        let mut guard = ACTIVE_CAPTURE.write().await;
        if let Some(state) = guard.as_mut() {
            if state.capture_id == capture_id {
                state.preview_path = Some(preview_path.clone());
            }
        }
    }

    Ok(CroquisCapturePreview {
        preview_path: preview_path.to_string_lossy().into_owned(),
        rect,
    })
}

/// Finalise a capture by moving the preview into place and ingesting it into the workspace.
pub async fn confirm_capture(
    app_handle: &tauri::AppHandle,
    capture_id: &str,
) -> Result<CroquisCaptureConfirmResponse> {
    let (state_snapshot, preview_path) = {
        let guard = ACTIVE_CAPTURE.read().await;
        let state = guard
            .as_ref()
            .ok_or_else(|| anyhow!("No active capture session"))?;
        if state.capture_id != capture_id {
            bail!("Capture session does not match active request");
        }
        let preview = state
            .preview_path
            .clone()
            .ok_or_else(|| anyhow!("Capture preview has not been generated"))?;
        (state.clone(), preview)
    };

    fs::create_dir_all(&state_snapshot.save_dir).await.with_context(|| {
        format!(
            "Failed to create capture output directory at {}",
            state_snapshot.save_dir.display()
        )
    })?;

    let file_name = format!("croquis_{}.png", get_unique_id());
    let final_path = state_snapshot.save_dir.join(&file_name);

    match fs::rename(&preview_path, &final_path).await {
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::CrossDeviceLink => {
            fs::copy(&preview_path, &final_path).await.with_context(|| {
                format!("Failed to copy capture to {}", final_path.display())
            })?;
            let _ = fs::remove_file(&preview_path).await;
        }
        Err(error) => {
            return Err(error).with_context(|| {
                format!("Failed to move capture to {}", final_path.display())
            });
        }
    }

    let mut tx = DB_MANAGER.create_new_tx(&state_snapshot.moa_id).await?;

    let norm_dir = normalize_path(state_snapshot.save_dir.as_path());
    let storage_info = storage_root::detect_storage_root(&norm_dir)
        .with_context(|| {
            format!("Failed to detect storage root for {}", norm_dir.display())
        })?;
    let real_folder_id = storage_root::ensure_storage_root_and_real_folder(
        &mut tx,
        &storage_info,
        &norm_dir,
    )
    .await?;

    let display_name = final_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| anyhow!("Capture filename contains invalid UTF-8"))?
        .to_string();

    let file_info = FileInfo::new(
        final_path.as_path(),
        real_folder_id.clone(),
        display_name.clone(),
    )
    .await?;

    let file_path_id =
        FileRepository::insert_file_path(tx.as_mut(), &file_info).await?;
    let file_content_id =
        FileRepository::upsert_file_content(tx.as_mut(), &file_info).await?;
    FileRepository::upsert_file_path_content_binding(
        tx.as_mut(),
        &file_path_id,
        &file_content_id,
    )
    .await?;

    NodeRepository::upsert_file_node(
        tx.as_mut(),
        "root".to_string(),
        file_content_id.clone(),
    )
    .await?;

    let original_fc_id = FileRepository::find_file_content_id(
        tx.as_mut(),
        state_snapshot.image_hash.clone(),
    )
    .await?
    .ok_or_else(|| anyhow!("Original file hash not found for capture"))?;

    let original_node_id =
        NodeRepository::fetch_node_id_by_fc_id(tx.as_mut(), original_fc_id)
            .await?
            .ok_or_else(|| anyhow!("Original node could not be resolved"))?;

    let new_node_id = NodeRepository::fetch_node_id_by_fc_id(
        tx.as_mut(),
        file_content_id.clone(),
    )
    .await?
    .ok_or_else(|| anyhow!("Capture node could not be resolved"))?;

    ConnectionRepository::insert_connection(
        tx.as_mut(),
        original_node_id,
        new_node_id,
        RelationType::CroquisReference,
        date::get_now_date(),
    )
    .await?;

    if file_info.file_exists && file_info.kind_guess == FileType::Image {
        enqueue_base_job(BaseThumbnailJob {
            moa_id: state_snapshot.moa_id.clone(),
            xxhs: file_info.xxh3_64.clone(),
            source_path: final_path.clone(),
        })
        .await;
    }

    tx.commit().await?;

    {
        let mut guard = ACTIVE_CAPTURE.write().await;
        if let Some(state) = guard.as_ref() {
            if state.capture_id == capture_id {
                *guard = None;
            }
        }
    }

    if let Some(window) =
        app_handle.get_webview_window(&state_snapshot.window_label)
    {
        let _ = window.close();
    }

    Ok(CroquisCaptureConfirmResponse {
        file_path: final_path.to_string_lossy().into_owned(),
        file_name: display_name,
    })
}

/// Cancel the active capture session and clean up any temporary resources.
pub async fn cancel_capture(
    app_handle: &tauri::AppHandle,
    capture_id: &str,
) -> Result<()> {
    let state_snapshot = {
        let guard = ACTIVE_CAPTURE.read().await;
        guard.as_ref().filter(|state| state.capture_id == capture_id).cloned()
    };

    if let Some(state) = state_snapshot {
        if let Some(preview_path) = state.preview_path.as_ref() {
            let _ = fs::remove_file(preview_path).await;
        }

        if let Some(window) = app_handle.get_webview_window(&state.window_label)
        {
            let _ = window.close();
        }

        let mut guard = ACTIVE_CAPTURE.write().await;
        if guard.as_ref().map(|s| s.capture_id.as_str()) == Some(capture_id) {
            *guard = None;
        }
    }

    Ok(())
}

fn capture_region(
    monitor: &CroquisCaptureMonitor,
    rect: &CroquisCaptureRect,
    out_path: &PathBuf,
) -> Result<()> {
    let screens = Screen::all()
        .map_err(|err| anyhow!("Failed to enumerate screens: {err}"))?;

    let screen = screens
        .iter()
        .find(|screen| screen.x() == monitor.x && screen.y() == monitor.y)
        .or_else(|| {
            screens.iter().find(|screen| {
                screen.width() == monitor.width
                    && screen.height() == monitor.height
            })
        })
        .ok_or_else(|| anyhow!("Unable to match monitor for capture"))?;

    let capture = screen
        .capture_area(rect.x as i32, rect.y as i32, rect.width, rect.height)
        .map_err(|err| anyhow!("Failed to capture screen: {err}"))?;

    let buffer = capture.buffer();
    let mut rgba = Vec::with_capacity(buffer.len());
    for chunk in buffer.chunks_exact(4) {
        rgba.push(chunk[2]);
        rgba.push(chunk[1]);
        rgba.push(chunk[0]);
        rgba.push(chunk[3]);
    }

    image::save_buffer_with_format(
        out_path,
        &rgba,
        rect.width,
        rect.height,
        ColorType::Rgba8,
        ImageFormat::Png,
    )
    .map_err(|err| anyhow!("Failed to write capture preview: {err}"))?;

    Ok(())
}

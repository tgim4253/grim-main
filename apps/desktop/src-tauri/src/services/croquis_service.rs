use std::{
    collections::HashMap,
    io::Cursor,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, bail, Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use image::{DynamicImage, ImageFormat, RgbaImage};
use once_cell::sync::Lazy;
use screenshots::Screen;
use tokio::{fs, sync::RwLock};
use tracing::{debug, warn};

use crate::{
    app_launcher,
    bootstrap::PATH_MANAGER,
    db::repository::{
        connection_repository::ConnectionRepository,
        file_repository::FileRepository, node_repository::NodeRepository,
    },
    models::connection::RelationType,
    models::croquis::{
        CaptureOverlayPayload, CroquisCaptureContext, CroquisCaptureMonitor,
        CroquisCapturePreview, CroquisCaptureRect, CroquisOption,
        CroquisPreferences, CroquisPreset, CroquisSession, CroquisSessionImage,
        CroquisStartPayload, CroquisStartResponse,
    },
    models::file::FileInfo,
    services::{
        db::DB_MANAGER,
        file_service::{
            folder::fetch_one_file_path,
            thumbnail::{ensure_base_thumbnail, BaseThumbInfo},
        },
        storage_root,
    },
    utils::{date, identifier::get_unique_id, path_utils::normalize_path},
};

/// In-memory registry of active Croquis sessions keyed by session identifier.
static CROQUIS_SESSIONS: Lazy<RwLock<HashMap<String, CroquisSession>>> =
    Lazy::new(|| RwLock::new(HashMap::new()));

/// Launch a new Croquis session by ensuring base images and spawning the window.
pub async fn start_session(
    app_handle: &tauri::AppHandle,
    payload: CroquisStartPayload,
) -> Result<CroquisStartResponse> {
    let CroquisStartPayload {
        moa_id,
        option,
        image_hashes,
        save_option,
        preferences,
    } = payload;

    if image_hashes.is_empty() {
        bail!("At least one image hash must be provided to start Croquis");
    }

    if save_option {
        let preferences_to_persist = preferences.unwrap_or_else(|| {
            let preset_id = get_unique_id();
            CroquisPreferences {
                active_preset_id: preset_id.clone(),
                presets: vec![CroquisPreset {
                    id: preset_id,
                    name: "Preset 1".to_string(),
                    option: option.clone(),
                }],
            }
        });
        persist_preferences(&moa_id, &preferences_to_persist).await?;
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
        app_launcher::croquis::launch_croquis(app_handle, &moa_id, &session)
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

/// Load the persisted Croquis preferences from the workspace settings directory.
pub async fn load_preferences(
    moa_id: &str,
) -> Result<Option<CroquisPreferences>> {
    let paths = PATH_MANAGER
        .get_or_add(moa_id)
        .await
        .context("Failed to resolve workspace paths")?;

    let settings_dir = paths.moa_dir.join("settings");
    let file_path = settings_dir.join("croquis.json");

    match fs::read(&file_path).await {
        Ok(payload) => {
            match serde_json::from_slice::<CroquisPreferences>(&payload) {
                Ok(mut preferences) => {
                    if preferences.presets.is_empty() {
                        let preset_id = get_unique_id();
                        preferences.presets.push(CroquisPreset {
                            id: preset_id.clone(),
                            name: "Preset 1".to_string(),
                            option: CroquisOption::default(),
                        });
                        preferences.active_preset_id = preset_id;
                    } else if preferences.active_preset_id.is_empty()
                        || !preferences.presets.iter().any(|preset| {
                            preset.id == preferences.active_preset_id
                        })
                    {
                        if let Some(first) = preferences.presets.first() {
                            preferences.active_preset_id = first.id.clone();
                        }
                    }

                    Ok(Some(preferences))
                }
                Err(primary_error) => {
                    match serde_json::from_slice::<CroquisOption>(&payload) {
                        Ok(option) => {
                            let preset_id = get_unique_id();
                            let preferences = CroquisPreferences {
                                active_preset_id: preset_id.clone(),
                                presets: vec![CroquisPreset {
                                    id: preset_id,
                                    name: "Preset 1".to_string(),
                                    option,
                                }],
                            };
                            Ok(Some(preferences))
                        }
                        Err(_) => Err(primary_error).context(format!(
                            "Failed to deserialise Croquis preferences from {}",
                            file_path.display()
                        )),
                    }
                }
            }
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error).with_context(|| {
            format!(
                "Failed to read Croquis preferences from {}",
                file_path.display()
            )
        }),
    }
}

/// Persist the Croquis preferences into the workspace `.moa/settings` folder.
async fn persist_preferences(
    moa_id: &str,
    preferences: &CroquisPreferences,
) -> Result<()> {
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
    let payload = serde_json::to_vec_pretty(preferences)
        .context("Failed to serialise Croquis preferences")?;

    fs::write(&file_path, payload).await.with_context(|| {
        format!(
            "Failed to write Croquis preferences to {}",
            file_path.display()
        )
    })?;

    Ok(())
}

pub async fn open_croquis_capture_overlay(
    app_handle: &tauri::AppHandle,
    payload: CaptureOverlayPayload,
) -> Result<()> {
    let CaptureOverlayPayload { moa_id, hash, session_id } = payload;

    let save_path = load_session(&session_id)
        .await
        .ok_or_else(|| anyhow!("Croquis session not found: {session_id}"))?;
    let save_path = save_path.option.save_path.clone();

    app_launcher::croquis::launch_croquis_capture(
        app_handle,
        &save_path,
        &hash,
        &moa_id,
        &session_id,
    )
    .map_err(|err| anyhow!(err))?;

    Ok(())
}

/// Capture a cropped preview of the requested monitor region.
pub async fn render_capture_preview(
    rect: CroquisCaptureRect,
    monitor: CroquisCaptureMonitor,
) -> Result<CroquisCapturePreview> {
    if rect.width == 0 || rect.height == 0 {
        bail!("Capture area must be larger than zero");
    }

    let png_bytes = tauri::async_runtime::spawn_blocking(move || {
        capture_region_as_png(rect, monitor)
    })
    .await
    .map_err(|err| anyhow!("Capture task panicked: {err}"))??;

    let base64 = BASE64_STANDARD.encode(png_bytes);
    let data_url = format!("data:image/png;base64,{base64}");

    Ok(CroquisCapturePreview { base_url: data_url })
}

/// Finalise a Croquis capture by writing it to disk and linking it in the graph.
pub async fn confirm_capture(
    base_url: String,
    context: CroquisCaptureContext,
) -> Result<()> {
    if base_url.is_empty() {
        bail!("Capture payload is empty");
    }

    let bytes = decode_data_url(&base_url)?;

    let (file_path, binding_context) =
        persist_capture_bytes(&context, bytes).await?;

    register_capture_in_workspace(binding_context).await?;

    debug!(
        path = %file_path.display(),
        session = %context.session_id,
        hash = %context.image_hash,
        "Croquis capture saved"
    );

    Ok(())
}

/// Context required to register a persisted capture in the workspace database.
struct CaptureRegistrationContext {
    moa_id: String,
    file_path: PathBuf,
    source_hash: String,
}

fn capture_region_as_png(
    rect: CroquisCaptureRect,
    monitor: CroquisCaptureMonitor,
) -> Result<Vec<u8>> {
    let screens = Screen::all()?;

    let target_screen = screens
        .into_iter()
        .find(|screen| {
            let info = screen.display_info;
            info.x == monitor.x
                && info.y == monitor.y
                && info.width == monitor.width as u32
                && info.height == monitor.height as u32
        })
        .or_else(|| Screen::from_point(monitor.x, monitor.y).ok())
        .ok_or_else(|| anyhow!("Failed to resolve monitor for capture"))?;

    let (capture_x, capture_y, capture_width, capture_height) =
        platform_capture_rect(rect, target_screen.display_info.scale_factor);

    let capture = target_screen.capture_area(
        capture_x,
        capture_y,
        capture_width,
        capture_height,
    )?;
    let width = capture.width();
    let height = capture.height();
    if width == 0 || height == 0 {
        bail!("Captured image has zero dimensions");
    }

    let pixels = capture.into_vec();
    let image = RgbaImage::from_raw(width, height, pixels)
        .ok_or_else(|| anyhow!("Failed to rebuild capture buffer"))?;

    let mut buffer = Vec::new();
    let mut cursor = Cursor::new(&mut buffer);
    DynamicImage::ImageRgba8(image)
        .write_to(&mut cursor, ImageFormat::Png)
        .context("Failed to encode capture preview as PNG")?;

    Ok(buffer)
}

fn decode_data_url(data_url: &str) -> Result<Vec<u8>> {
    let delimiter = ",";
    let (_, data) = data_url
        .split_once(delimiter)
        .ok_or_else(|| anyhow!("Invalid data URL payload"))?;
    BASE64_STANDARD
        .decode(data.trim())
        .map_err(|err| anyhow!("Failed to decode capture payload: {err}"))
}

fn generate_capture_file_name(context: &CroquisCaptureContext) -> String {
    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    format!(
        "croquis_{hash}_{ts}.png",
        hash = context.image_hash,
        ts = timestamp
    )
}

async fn ensure_unique_path(path: PathBuf) -> Result<PathBuf> {
    if fs::metadata(&path).await.is_err() {
        return Ok(path);
    }

    let parent = path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| anyhow!("Capture path is missing a parent directory"))?;
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("capture");
    let extension = path.extension().and_then(|s| s.to_str()).unwrap_or("png");

    for index in 1..10_000 {
        let candidate = parent.join(format!("{stem}-{index}.{extension}"));
        if fs::metadata(&candidate).await.is_err() {
            return Ok(candidate);
        }
    }

    bail!("Unable to generate unique capture filename for {}", path.display())
}

async fn persist_capture_bytes(
    context: &CroquisCaptureContext,
    bytes: Vec<u8>,
) -> Result<(PathBuf, CaptureRegistrationContext)> {
    if context.save_path.trim().is_empty() {
        bail!("Croquis capture save path is not configured");
    }

    let mut target = PathBuf::from(&context.save_path);

    let metadata = fs::metadata(&target).await.ok();
    let treat_as_dir = metadata
        .map(|meta| meta.is_dir())
        .unwrap_or_else(|| target.extension().is_none());

    let mut prepared_path = if treat_as_dir {
        fs::create_dir_all(&target).await.with_context(|| {
            format!("Failed to ensure capture directory {}", target.display())
        })?;
        let default_name = generate_capture_file_name(context);
        ensure_unique_path(target.join(default_name)).await?
    } else {
        if target.extension().is_none() {
            target.set_extension("png");
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).await.with_context(|| {
                format!(
                    "Failed to ensure capture parent directory {}",
                    parent.display()
                )
            })?;
        }
        ensure_unique_path(target).await?
    };

    fs::write(&prepared_path, &bytes).await.with_context(|| {
        format!("Failed to write capture to {}", prepared_path.display())
    })?;

    prepared_path = normalize_path(&prepared_path);

    let registration = CaptureRegistrationContext {
        moa_id: context.moa_id.clone(),
        file_path: prepared_path.clone(),
        source_hash: context.image_hash.clone(),
    };

    Ok((prepared_path, registration))
}

#[cfg_attr(not(target_os = "windows"), allow(unused_variables))]
fn platform_capture_rect(
    rect: CroquisCaptureRect,
    scale_factor: f32,
) -> (i32, i32, u32, u32) {
    #[cfg(target_os = "windows")]
    {
        let scale = if scale_factor <= 0.0 { 1.0 } else { scale_factor } as f64;
        let x = ((rect.x as f64) * scale).round() as i32;
        let y = ((rect.y as f64) * scale).round() as i32;
        let width = ((rect.width as f64) * scale).round().max(1.0) as u32;
        let height = ((rect.height as f64) * scale).round().max(1.0) as u32;
        return (x, y, width, height);
    }

    #[cfg(not(target_os = "windows"))]
    {
        (rect.x, rect.y, rect.width, rect.height)
    }
}

async fn register_capture_in_workspace(
    context: CaptureRegistrationContext,
) -> Result<()> {
    let CaptureRegistrationContext { moa_id, file_path, source_hash } = context;

    let parent = file_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| anyhow!("Capture file has no parent directory"))?;

    let parent_norm = normalize_path(&parent);
    let sroot_info = storage_root::detect_storage_root(&parent_norm)?;

    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;
    let real_folder_id = storage_root::ensure_storage_root_and_real_folder(
        &mut tx,
        &sroot_info,
        &parent_norm,
    )
    .await?;

    let file_name = file_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("Capture filename is invalid"))?
        .to_string();

    let file_info =
        FileInfo::new(&file_path, real_folder_id.clone(), file_name)
            .await
            .context("Failed to derive capture metadata")?;

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

    let file_node_id = if let Some(existing_node) =
        NodeRepository::fetch_node_id_by_fc_id(
            tx.as_mut(),
            file_content_id.clone(),
        )
        .await?
    {
        existing_node
    } else {
        NodeRepository::create_orphan_file_node(
            tx.as_mut(),
            file_content_id.clone(),
        )
        .await?
    };

    if let Some(original_fc_id) =
        FileRepository::find_file_content_id(tx.as_mut(), source_hash.clone())
            .await?
    {
        if let Some(original_node_id) = NodeRepository::fetch_node_id_by_fc_id(
            tx.as_mut(),
            original_fc_id.clone(),
        )
        .await?
        {
            let now = date::get_now_date();
            let _ = ConnectionRepository::insert_connection(
                tx.as_mut(),
                original_node_id.clone(),
                file_node_id.clone(),
                RelationType::CroquisResLink,
                now.clone(),
            )
            .await?;
            let _ = ConnectionRepository::insert_connection(
                tx.as_mut(),
                file_node_id.clone(),
                original_node_id,
                RelationType::CroquisRefLink,
                now,
            )
            .await?;
        } else {
            warn!(
                hash = %source_hash,
                "Croquis source node missing; skipping link"
            );
        }
    } else {
        warn!(
            hash = %source_hash,
            "Croquis source file content missing; skipping link"
        );
    }

    tx.commit().await?;

    Ok(())
}

use std::{
    io::Cursor,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, bail, Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use image::{DynamicImage, ImageFormat, RgbaImage};
use screenshots::Screen;
use tauri::Emitter;
use tokio::fs;
use tracing::{debug, warn};

use crate::{
    app_launcher,
    db::repository::{
        connection_repository::ConnectionRepository,
        file_repository::FileRepository, node_repository::NodeRepository,
    },
    models::{
        capture::{
            CaptureContext, CaptureMonitor, CaptureOverlayPayload,
            CapturePreview, CaptureRect,
        },
        connection::RelationType,
        file::FileInfo,
    },
    services::{db::DB_MANAGER, storage_root},
    utils::{date, path_utils::normalize_path},
};

/// Launch the transparent capture overlay used to select screen regions.
pub async fn open_capture_overlay(
    app_handle: &tauri::AppHandle,
    payload: CaptureOverlayPayload,
) -> Result<()> {
    app_launcher::capture::launch_capture_overlay(app_handle, &payload)
        .map_err(|err| anyhow!(err))?;

    Ok(())
}

/// Capture a cropped preview of the requested monitor region.
pub async fn render_capture_preview(
    rect: CaptureRect,
    monitor: CaptureMonitor,
) -> Result<CapturePreview> {
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

    Ok(CapturePreview { base_url: data_url })
}

/// Finalise a capture by writing it to disk and linking it in the graph.
pub async fn confirm_capture(
    app_handle: &tauri::AppHandle,
    base_url: String,
    context: CaptureContext,
) -> Result<()> {
    if base_url.is_empty() {
        bail!("Capture payload is empty");
    }

    let bytes = decode_data_url(&base_url)?;

    let (file_path, binding_context) =
        persist_capture_bytes(&context, bytes).await?;

    let file_node_id = register_capture_in_workspace(binding_context).await?;

    debug!(
        path = %file_path.display(),
        session = ?context.session_id,
        hash = context
            .source_hash
            .as_deref()
            .unwrap_or("n/a"),
        "Capture saved",
    );

    #[derive(serde::Serialize, Clone)]
    struct CaptureCompletedPayload {
        file_path: String,
        file_node_id: String,
        moa_id: String,
    }

    let payload = CaptureCompletedPayload {
        file_path: file_path.to_string_lossy().into_owned(),
        file_node_id,
        moa_id: context.moa_id.clone(),
    };

    app_handle
        .emit(&format!("capture://completed/{}", context.moa_id), payload)
        .map_err(|err| {
            anyhow!("Failed to emit capture completion event: {err}")
        })?;

    Ok(())
}

/// Context required to register a persisted capture in the workspace database.
struct CaptureRegistrationContext {
    moa_id: String,
    file_path: PathBuf,
    source_hash: Option<String>,
    anchor_node_id: Option<String>,
    link_type_forward: Option<RelationType>,
    link_type_reverse: Option<RelationType>,
}

fn capture_region_as_png(
    rect: CaptureRect,
    monitor: CaptureMonitor,
) -> Result<Vec<u8>> {
    let screens = Screen::all()?;

    let target_screen = screens
        .into_iter()
        .find(|screen| {
            let info = screen.display_info;
            info.x == monitor.x
                && info.y == monitor.y
                && info.width == monitor.width
                && info.height == monitor.height
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

fn generate_capture_file_name(context: &CaptureContext) -> String {
    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let hash_component = context
        .source_hash
        .as_deref()
        .filter(|hash| !hash.is_empty())
        .unwrap_or("capture");
    if let Some(session) = &context.session_id {
        format!(
            "capture_{session}_{hash}_{ts}.png",
            session = session,
            hash = hash_component,
            ts = timestamp
        )
    } else {
        format!(
            "capture_{hash}_{ts}.png",
            hash = hash_component,
            ts = timestamp
        )
    }
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
    context: &CaptureContext,
    bytes: Vec<u8>,
) -> Result<(PathBuf, CaptureRegistrationContext)> {
    if context.save_path.trim().is_empty() {
        bail!("Capture save path is not configured");
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
        source_hash: context.source_hash.clone(),
        anchor_node_id: context.source_node_id.clone(),
        link_type_forward: context.link_type_forward,
        link_type_reverse: context.link_type_reverse,
    };

    Ok((prepared_path, registration))
}

#[cfg_attr(not(target_os = "windows"), allow(unused_variables))]
fn platform_capture_rect(
    rect: CaptureRect,
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
) -> Result<String> {
    let CaptureRegistrationContext {
        moa_id,
        file_path,
        source_hash,
        anchor_node_id,
        link_type_forward,
        link_type_reverse,
    } = context;

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
        FileInfo::new(&moa_id, &file_path, real_folder_id.clone(), file_name)
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

    let mut anchor_node_id = anchor_node_id;

    if anchor_node_id.is_none() {
        if let Some(hash) = source_hash.clone() {
            if let Some(original_fc_id) =
                FileRepository::find_file_content_id(tx.as_mut(), hash.clone())
                    .await?
            {
                if let Some(original_node_id) =
                    NodeRepository::fetch_node_id_by_fc_id(
                        tx.as_mut(),
                        original_fc_id.clone(),
                    )
                    .await?
                {
                    anchor_node_id = Some(original_node_id);
                } else {
                    warn!(hash = %hash, "Capture source node missing; skipping link");
                }
            } else {
                warn!(
                    hash = %hash,
                    "Capture source file content missing; skipping link",
                );
            }
        }
    }

    if let Some(anchor_id) = anchor_node_id {
        let now = date::get_now_date();
        if let Some(kind) = link_type_forward {
            let _ = ConnectionRepository::insert_connection(
                tx.as_mut(),
                anchor_id.clone(),
                file_node_id.clone(),
                kind,
                now.clone(),
            )
            .await?;
        }
        if let Some(kind) = link_type_reverse {
            let _ = ConnectionRepository::insert_connection(
                tx.as_mut(),
                file_node_id.clone(),
                anchor_id.clone(),
                kind,
                now,
            )
            .await?;
        }
    }

    tx.commit().await?;

    Ok(file_node_id)
}

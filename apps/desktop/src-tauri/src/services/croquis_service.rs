use std::{collections::HashMap, io::Cursor, io::ErrorKind, path::PathBuf};

use anyhow::{anyhow, bail, Context, Result};
use image::ImageOutputFormat;
use once_cell::sync::Lazy;
use tokio::{fs, sync::RwLock, task};
use tracing::warn;

use crate::{
    app_launcher,
    bootstrap::PATH_MANAGER,
    models::connection::RelationType,
    models::croquis::{
        CroquisCaptureRequest, CroquisCaptureResponse, CroquisOption,
        CroquisSession, CroquisSessionImage, CroquisStartPayload,
        CroquisStartResponse,
    },
    models::file::{FileInfo, FileType},
    services::db::DB_MANAGER,
    services::file_service::{
        folder::fetch_one_file_path,
        job_queue::{enqueue_base_job, BaseThumbnailJob},
        thumbnail::{ensure_base_thumbnail, BaseThumbInfo},
    },
    services::storage_root,
    utils::{date, identifier::get_unique_id, path_utils::normalize_path},
};

use crate::db::repository::{
    connection_repository::ConnectionRepository,
    file_repository::FileRepository, node_repository::NodeRepository,
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

/// Crop and persist a capture for the active session, linking it to the source image.
pub async fn capture_reference(
    _app_handle: &tauri::AppHandle,
    payload: CroquisCaptureRequest,
) -> Result<CroquisCaptureResponse> {
    let CroquisCaptureRequest { session_id, image_hash, selection, mode: _ } =
        payload;

    let session = {
        let sessions = CROQUIS_SESSIONS.read().await;
        sessions.get(&session_id).cloned()
    }
    .ok_or_else(|| anyhow!("Croquis session not found for id {session_id}"))?;

    let image = session
        .images
        .iter()
        .find(|item| item.hash == image_hash)
        .cloned()
        .ok_or_else(|| {
            anyhow!("Croquis image not found for hash {image_hash}")
        })?;

    let save_dir_raw = session.option.save_path.trim();
    if save_dir_raw.is_empty() {
        bail!("Croquis capture path is not configured for this session");
    }

    let save_dir = PathBuf::from(save_dir_raw);
    fs::create_dir_all(&save_dir).await.with_context(|| {
        format!(
            "Failed to create Croquis capture directory at {}",
            save_dir.display()
        )
    })?;

    let file_name = format!("croquis_{}.png", get_unique_id());
    let file_path = save_dir.join(&file_name);

    let base_width = image.base_width.max(1) as f32;
    let base_height = image.base_height.max(1) as f32;
    let source_path = PathBuf::from(&image.source_path);

    let source_bytes = fs::read(&source_path).await.with_context(|| {
        format!(
            "Failed to read Croquis source image at {}",
            source_path.display()
        )
    })?;

    let selection_clone = selection.clone();
    let (encoded, _dimensions) =
        task::spawn_blocking(move || -> Result<(Vec<u8>, (u32, u32))> {
            let image = image::load_from_memory(&source_bytes)
                .context("Failed to decode source image for capture")?;
            let (orig_w, orig_h) = image.dimensions();
            if orig_w == 0 || orig_h == 0 {
                bail!("Source image has invalid dimensions");
            }

            let clamp01 = |value: f32| value.clamp(0.0, 1.0);
            let left = clamp01(selection_clone.left);
            let top = clamp01(selection_clone.top);
            let width = clamp01(selection_clone.width);
            let height = clamp01(selection_clone.height);
            if width <= f32::EPSILON || height <= f32::EPSILON {
                bail!("Capture selection is too small");
            }

            let base_left = left * base_width;
            let base_top = top * base_height;
            let base_right = ((left + width).clamp(0.0, 1.0)) * base_width;
            let base_bottom = ((top + height).clamp(0.0, 1.0)) * base_height;

            let scale_x = orig_w as f32 / base_width;
            let scale_y = orig_h as f32 / base_height;

            let crop_left =
                (base_left * scale_x).floor().clamp(0.0, (orig_w - 1) as f32);
            let crop_top =
                (base_top * scale_y).floor().clamp(0.0, (orig_h - 1) as f32);
            let crop_right = (base_right * scale_x)
                .ceil()
                .clamp(crop_left + 1.0, orig_w as f32);
            let crop_bottom = (base_bottom * scale_y)
                .ceil()
                .clamp(crop_top + 1.0, orig_h as f32);

            let crop_width = (crop_right - crop_left).round().max(1.0) as u32;
            let crop_height = (crop_bottom - crop_top).round().max(1.0) as u32;

            let cropped = image.crop_imm(
                crop_left as u32,
                crop_top as u32,
                crop_width,
                crop_height,
            );

            let mut buffer = Vec::new();
            cropped
                .write_to(&mut Cursor::new(&mut buffer), ImageOutputFormat::Png)
                .context("Failed to encode capture image as PNG")?;

            Ok((buffer, (crop_width, crop_height)))
        })
        .await
        .context("Croquis capture task failed")??;

    fs::write(&file_path, &encoded).await.with_context(|| {
        format!("Failed to write Croquis capture to {}", file_path.display())
    })?;

    let capture_result: Result<CroquisCaptureResponse> = async {
        let normalized_dir = normalize_path(&save_dir);
        let mut tx = DB_MANAGER.create_new_tx(&session.moa_id).await?;

        let storage_info = storage_root::detect_storage_root(&normalized_dir)?;
        let real_folder_id = storage_root::ensure_storage_root_and_real_folder(
            &mut tx,
            &storage_info,
            &normalized_dir,
        )
        .await?;

        let virtual_folder_id = if let Some(existing) =
            FileRepository::find_virtual_folder_id_by_real_folder(
                tx.as_mut(),
                &real_folder_id,
            )
            .await?
        {
            existing
        } else {
            let folder_name = save_dir
                .file_name()
                .and_then(|name| name.to_str())
                .map(|s| s.to_string())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Croquis Captures".to_string());
            let node = FileRepository::create_virtual_folder(
                tx.as_mut(),
                folder_name,
                "root".to_string(),
            )
            .await?;
            FileRepository::create_virtual_folder_mount(
                tx.as_mut(),
                node.id.clone(),
                real_folder_id.clone(),
            )
            .await?;
            node.id
        };

        let capture_file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| anyhow!("Failed to resolve capture file name"))?
            .to_string();

        let file_info = FileInfo::new(
            &file_path,
            real_folder_id.clone(),
            capture_file_name.clone(),
        )
        .await?;
        let file_path_id =
            FileRepository::insert_file_path(tx.as_mut(), &file_info).await?;
        let file_content_id =
            FileRepository::upsert_file_content(tx.as_mut(), &file_info)
                .await?;
        FileRepository::upsert_file_path_content_binding(
            tx.as_mut(),
            &file_path_id,
            &file_content_id,
        )
        .await?;

        NodeRepository::upsert_file_node(
            tx.as_mut(),
            virtual_folder_id.clone(),
            file_content_id.clone(),
        )
        .await?;

        if file_info.file_exists && file_info.kind_guess == FileType::Image {
            enqueue_base_job(BaseThumbnailJob {
                moa_id: session.moa_id.clone(),
                xxhs: file_info.xxh3_64.clone(),
                source_path: file_path.clone(),
            })
            .await;
        }

        let new_node_id = NodeRepository::fetch_node_id_by_fc_id(
            tx.as_mut(),
            file_content_id.clone(),
        )
        .await?
        .ok_or_else(|| anyhow!("Failed to resolve capture node id"))?;

        let original_content_id = FileRepository::find_file_content_id(
            tx.as_mut(),
            image.hash.clone(),
        )
        .await?
        .ok_or_else(|| {
            anyhow!("Original file metadata missing for capture source")
        })?;
        let original_node_id = NodeRepository::fetch_node_id_by_fc_id(
            tx.as_mut(),
            original_content_id,
        )
        .await?
        .ok_or_else(|| anyhow!("Original node missing for capture source"))?;

        ConnectionRepository::insert_connection(
            tx.as_mut(),
            original_node_id,
            new_node_id.clone(),
            RelationType::CroquisReference,
            date::get_now_date(),
        )
        .await?;

        tx.commit().await?;

        Ok(CroquisCaptureResponse {
            saved_path: file_path.to_string_lossy().into_owned(),
            file_name: capture_file_name,
            node_id: new_node_id,
        })
    }
    .await;

    if capture_result.is_err() {
        let _ = fs::remove_file(&file_path).await;
    }

    capture_result
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

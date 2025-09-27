use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
};

use anyhow::{anyhow, bail, Context, Result};
use fast_image_resize::{
    images::Image, FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer,
};
use image::{DynamicImage, GenericImageView};
use num_cpus;
use tauri::{AppHandle, Emitter};
use tokio::{
    sync::{mpsc, Semaphore},
    task,
};
use tracing::warn;

use crate::models::file::{
    ImageFmt, ThumbBasePath, ThumbPath, ThumbRequest, ThumbResInfo,
    ThumbResSpec, ThumbResponse, ThumbStatus, THUMB_BASE_WIDTH,
};

use super::{
    folder::fetch_one_file_path,
    job_queue::{
        cancel_pending_base_job, enqueue_jobs, finish_base_job, finish_job,
        take_next_base_job, take_next_job, BaseThumbnailJob, ThumbnailJob,
        THUMBNAIL_WORKER_STATE,
    },
};

/// Version tag embedded in generated thumbnail paths.
pub const SCHEMA_VERSION: u8 = 1;

/// Metadata about the cached base thumbnail for a file hash.
#[derive(Debug, Clone)]
pub struct BaseThumbInfo {
    pub path: ThumbBasePath,
    pub width: u32,
    pub height: u32,
}

/// Ensure a cached 512px-wide thumbnail exists for the provided file hash.
pub async fn ensure_base_thumbnail(
    app: &AppHandle,
    moa_id: &str,
    hash: &str,
    source_path: &Path,
) -> Result<BaseThumbInfo> {
    let base_path = ThumbBasePath::new(app, moa_id, hash, SCHEMA_VERSION)?;

    if tokio::fs::metadata(base_path.as_path()).await.is_ok() {
        let dims = task::spawn_blocking({
            let path = base_path.as_path().to_path_buf();
            move || -> Result<(u32, u32)> {
                image::image_dimensions(&path).map_err(|err| {
                    anyhow!("failed to read cached base dimensions: {err}")
                })
            }
        })
        .await;

        match dims {
            Ok(Ok((width, height))) => {
                return Ok(BaseThumbInfo { path: base_path, width, height });
            }
            Ok(Err(err)) => {
                warn!(
                    "invalid cached base thumbnail for {:?}: {}",
                    base_path.as_path(),
                    err
                );
                let _ = tokio::fs::remove_file(base_path.as_path()).await;
            }
            Err(err) => {
                warn!(
                    "failed to join cached base dimension task for {:?}: {}",
                    base_path.as_path(),
                    err
                );
                let _ = tokio::fs::remove_file(base_path.as_path()).await;
            }
        }
    }

    let data = tokio::fs::read(source_path).await.with_context(|| {
        format!("failed to read source image: {}", source_path.display())
    })?;

    let image: DynamicImage = task::spawn_blocking({
        let data = data.clone();
        move || image::load_from_memory(&data).context("image decode failed")
    })
    .await
    .context("join error")??;

    let (w, h) = image.dimensions();
    if w == 0 || h == 0 {
        bail!("invalid image dimensions: {}x{}", w, h);
    }

    let scale = if w > THUMB_BASE_WIDTH {
        THUMB_BASE_WIDTH as f32 / w as f32
    } else {
        1.0
    };

    let target_w = ((w as f32 * scale).round() as u32).max(1);
    let target_h = ((h as f32 * scale).round() as u32).max(1);

    let rgba = image.to_rgba8();
    let (src_w, src_h) = rgba.dimensions();
    let src_image =
        Image::from_vec_u8(src_w, src_h, rgba.into_raw(), PixelType::U8x4)
            .expect("invalid source image");
    let mut dst_image = Image::new(target_w, target_h, src_image.pixel_type());

    let mut resizer = Resizer::new();
    resizer
        .resize(
            &src_image,
            &mut dst_image,
            &ResizeOptions::new()
                .resize_alg(ResizeAlg::Convolution(FilterType::CatmullRom)),
        )
        .expect("resize failed");

    if let Some(parent) = base_path.as_path().parent() {
        tokio::fs::create_dir_all(parent).await?;
    } else {
        bail!("bad base thumbnail path");
    }

    let encoded = task::spawn_blocking({
        let buffer = dst_image.into_vec();
        let target_w = target_w;
        let target_h = target_h;

        move || -> Result<Vec<u8>> {
            let mut rgb = Vec::with_capacity(
                (target_w as usize) * (target_h as usize) * 3,
            );
            for px in buffer.chunks_exact(4) {
                rgb.extend_from_slice(&[px[0], px[1], px[2]]);
            }

            let mut out = Vec::new();
            // JPEG with quality ~75 is a good thumbnail default
            let mut enc = image::codecs::jpeg::JpegEncoder::new_with_quality(
                &mut out, 75,
            );
            enc.encode(
                &rgb,
                target_w,
                target_h,
                image::ExtendedColorType::Rgb8,
            )
            .context("jpeg encode failed")?;
            Ok(out)
        }
    })
    .await??;

    let tmp_path = base_path.as_path().with_extension("tmp");
    tokio::fs::write(&tmp_path, &encoded).await?;
    tokio::fs::rename(&tmp_path, base_path.as_path())
        .await
        .context("rename failed")?;

    Ok(BaseThumbInfo { path: base_path, width: target_w, height: target_h })
}

/// Fetch thumbnail metadata and queue missing thumbnails for background generation.
pub async fn get_thumbs(
    app: &AppHandle,
    moa_id: String,
    data: ThumbRequest,
) -> Result<ThumbResponse> {
    let mut response = ThumbResponse { items: Vec::new() };
    let mut pending_jobs: Vec<ThumbnailJob> = Vec::new();

    for item in data.items {
        let specs = item.specs;
        let mut res_specs: Vec<ThumbResSpec> = Vec::new();

        for spec in specs {
            let ThumbPath(thumb_path) = match ThumbPath::new(
                app,
                &moa_id,
                spec.clone(),
                item.xxhs.clone(),
                SCHEMA_VERSION,
            )
            .await
            {
                Ok(path) => path,
                Err(error) => {
                    res_specs.push(ThumbResSpec {
                        status: ThumbStatus::Error,
                        url: None,
                        thumb_key: spec.key.clone(),
                        enqueued: false,
                        error_msg: Some(error.to_string()),
                    });
                    continue;
                }
            };

            if thumb_path.exists() {
                res_specs.push(ThumbResSpec {
                    status: ThumbStatus::Hit,
                    url: Some(thumb_path.to_string_lossy().to_string()),
                    thumb_key: spec.key.clone(),
                    enqueued: false,
                    error_msg: None,
                });
                continue;
            }

            pending_jobs.push(ThumbnailJob {
                moa_id: moa_id.clone(),
                xxhs: item.xxhs.clone(),
                thumb_key: spec.key.clone(),
                spec: spec.clone(),
                out_path: thumb_path,
                priority: 0,
            });
            res_specs.push(ThumbResSpec {
                status: ThumbStatus::Miss,
                url: None,
                thumb_key: spec.key.clone(),
                enqueued: true,
                error_msg: None,
            });
        }

        response.items.push(ThumbResInfo { xxhs: item.xxhs, specs: res_specs });
    }

    enqueue_jobs(pending_jobs).await;

    Ok(response)
}

/// Background worker that receives wake signals and processes queued thumbnail jobs.
pub async fn worker_loop(app: AppHandle, mut rx: mpsc::Receiver<()>) {
    let semaphore = Arc::new(Semaphore::new(num_cpus::get().max(2)));

    loop {
        let _ = rx.recv().await;

        loop {
            let has_active = {
                let active = THUMBNAIL_WORKER_STATE.active_moas.lock().await;
                !active.is_empty()
            };

            if !has_active {
                break;
            }

            let mut made_progress = false;

            if let Some(base_job) = take_next_base_job().await {
                let app_cloned = app.clone();
                let semaphore_cloned = semaphore.clone();

                tokio::spawn(async move {
                    let _permit = semaphore_cloned.acquire().await.unwrap();
                    let job_clone = base_job.clone();
                    let result = process_base_job(&app_cloned, base_job).await;

                    finish_base_job(&job_clone).await;

                    if let Err(error) = result {
                        warn!(
                            "failed to precache base thumbnail for {}: {}",
                            job_clone.xxhs, error
                        );
                    }
                });

                task::yield_now().await;
                made_progress = true;
            }

            if let Some(job) = take_next_job().await {
                let app_cloned = app.clone();
                let semaphore_cloned = semaphore.clone();

                tokio::spawn(async move {
                    let _permit = semaphore_cloned.acquire().await.unwrap();
                    let job_clone = job.clone();
                    let result = process_job(&app_cloned, job).await;

                    finish_job(&job_clone).await;

                    if let Err(error) = result {
                        let _ = emit_created(
                            &app_cloned,
                            vec![ThumbResSpec {
                                thumb_key: job_clone.thumb_key,
                                status: ThumbStatus::Error,
                                url: None,
                                enqueued: false,
                                error_msg: Some(error.to_string()),
                            }],
                        )
                        .await;
                    }
                });

                task::yield_now().await;
                made_progress = true;
            }

            if !made_progress {
                break;
            }
        }
    }
}

/// Generate a thumbnail for the provided job and emit a completion event.
async fn process_job(app: &AppHandle, job: ThumbnailJob) -> Result<()> {
    let timer_all = Instant::now();

    let source_path =
        fetch_one_file_path(job.moa_id.clone(), job.xxhs.clone()).await?;

    cancel_pending_base_job(&job.xxhs).await;

    let file_kind = infer::get_from_path(&source_path)
        .context("failed to read file")?
        .ok_or_else(|| anyhow!("unknown file type"))?;
    if !file_kind.mime_type().starts_with("image/") {
        bail!("unsupported mime type for thumbnail generation");
    }

    let (input_path, used_cache) =
        match ensure_base_thumbnail(app, &job.moa_id, &job.xxhs, &source_path)
            .await
        {
            Ok(info) => {
                let BaseThumbInfo { path, width, height } = info;
                if job.spec.width <= width && job.spec.height <= height {
                    (PathBuf::from(path), true)
                } else {
                    (source_path.clone(), false)
                }
            }
            Err(err) => {
                warn!(
                    "failed to ensure base thumbnail for {:?}: {}",
                    source_path, err
                );
                (source_path.clone(), false)
            }
        };

    let data = tokio::fs::read(&input_path).await.with_context(|| {
        format!("read source failed: {}", input_path.display())
    })?;

    let output_path = job.out_path.clone();
    let tmp_path = output_path.with_extension("tmp");

    let decode_start = Instant::now();
    let image: DynamicImage = task::spawn_blocking({
        let data = data.clone();
        move || image::load_from_memory(&data).context("image decode failed")
    })
    .await
    .context("join error")??;
    let decode_elapsed = decode_start.elapsed();

    let resize_start = Instant::now();
    let (target_width, target_height) = (job.spec.width, job.spec.height);
    let (output_buf, out_w, out_h) =
        task::spawn_blocking(move || -> (Vec<u8>, u32, u32) {
            let rgba = image.to_rgba8();
            let (w, h) = rgba.dimensions();

            let target_w = target_width.max(1);
            let target_h = if target_height == 0 {
                h * target_width / w
            } else {
                target_height
            };

            let target_ar = target_w as f32 / target_h as f32;
            let src_ar = w as f32 / h as f32;

            let (left, top, crop_w, crop_h) = if src_ar > target_ar {
                let crop_w_f = (h as f32 * target_ar).round().max(1.0);
                let crop_w = crop_w_f as u32;
                let left = ((w.saturating_sub(crop_w)) / 2) as u32;
                (left, 0u32, crop_w, h)
            } else if src_ar < target_ar {
                let crop_h_f = (w as f32 / target_ar).round().max(1.0);
                let crop_h = crop_h_f as u32;
                let top = ((h.saturating_sub(crop_h)) / 2) as u32;
                (0u32, top, w, crop_h)
            } else {
                (0u32, 0u32, w, h)
            };

            let src_image =
                Image::from_vec_u8(w, h, rgba.into_raw(), PixelType::U8x4)
                    .expect("Invalid source");

            let scale_w = target_w as f32 / crop_w as f32;
            let scale_h = target_h as f32 / crop_h as f32;
            let scale = scale_w.min(scale_h).min(1.0).max(0.0);

            let dst_w = ((crop_w as f32 * scale).round() as u32).max(1);
            let dst_h = ((crop_h as f32 * scale).round() as u32).max(1);

            let mut dst_image =
                Image::new(dst_w, dst_h, src_image.pixel_type());

            let mut resizer = Resizer::new();
            resizer
                .resize(
                    &src_image,
                    &mut dst_image,
                    &ResizeOptions::new()
                        .crop(
                            left as f64,
                            top as f64,
                            crop_w as f64,
                            crop_h as f64,
                        )
                        .resize_alg(ResizeAlg::Convolution(FilterType::Box)),
                )
                .expect("resize failed");

            let out = dst_image.buffer().to_vec();
            (out, dst_w, dst_h)
        })
        .await?;
    let resize_elapsed = resize_start.elapsed();

    if let Some(parent) = output_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    } else {
        bail!("bad output path");
    }

    let encode_start = Instant::now();
    let encoded = task::spawn_blocking({
        let buffer = output_buf;
        let (w, h) = (out_w, out_h);
        let format = job.spec.fmt;
        move || -> Result<Vec<u8>> {
            let mut buf = Vec::new();
            match format {
                Some(ImageFmt::Webp) => {
                    image::codecs::webp::WebPEncoder::new_lossless(&mut buf)
                        .encode(&buffer, w, h, image::ExtendedColorType::Rgba8)
                        .context("webp encode failed")?;
                }
                _ => {
                    let mut rgb =
                        Vec::with_capacity((w as usize) * (h as usize) * 3);
                    for px in buffer.chunks_exact(4) {
                        rgb.extend_from_slice(&[px[0], px[1], px[2]]);
                    }

                    // JPEG with quality ~75 is a good thumbnail default
                    let mut enc =
                        image::codecs::jpeg::JpegEncoder::new_with_quality(
                            &mut buf, 75,
                        );
                    enc.encode(&rgb, w, h, image::ExtendedColorType::Rgb8)
                        .context("jpeg encode failed")?;
                }
            }
            Ok(buf)
        }
    })
    .await??;
    let encode_elapsed = encode_start.elapsed();

    tokio::fs::write(&tmp_path, &encoded).await?;
    tokio::fs::rename(&tmp_path, &output_path)
        .await
        .context("rename failed")?;

    emit_created(
        app,
        vec![ThumbResSpec {
            thumb_key: job.thumb_key,
            status: ThumbStatus::Hit,
            url: Some(output_path.to_string_lossy().to_string()),
            enqueued: false,
            error_msg: None,
        }],
    )
    .await?;

    tracing::info!(
        "[perf] decode: {:?} ms | resize: {:?} ms | encode: {:?} ms | total: {:?} ms | source: {}",
        decode_elapsed.as_millis(),
        resize_elapsed.as_millis(),
        encode_elapsed.as_millis(),
        timer_all.elapsed().as_millis(),
        if used_cache { "cache" } else { "original" }
    );

    Ok(())
}

/// Generate a base thumbnail for the provided job.
async fn process_base_job(
    app: &AppHandle,
    job: BaseThumbnailJob,
) -> Result<()> {
    if !job.source_path.exists() {
        bail!("base source missing: {}", job.source_path.display());
    }

    let file_kind = infer::get_from_path(&job.source_path)
        .context("failed to read file")?
        .ok_or_else(|| anyhow!("unknown file type"))?;
    if !file_kind.mime_type().starts_with("image/") {
        bail!("unsupported mime type for base thumbnail generation");
    }

    ensure_base_thumbnail(app, &job.moa_id, &job.xxhs, &job.source_path)
        .await?;

    Ok(())
}

/// Emit a thumbnail creation event to the renderer.
async fn emit_created(app: &AppHandle, items: Vec<ThumbResSpec>) -> Result<()> {
    #[derive(serde::Serialize, Clone)]
    struct ThumbEvent {
        items: Vec<ThumbResSpec>,
    }
    let payload = ThumbEvent { items };
    app.emit("thumbnails://created", payload).context("emit failed")?;
    Ok(())
}

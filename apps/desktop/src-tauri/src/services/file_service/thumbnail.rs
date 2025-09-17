use std::{sync::Arc, time::Instant};

use anyhow::{anyhow, bail, Context, Result};
use fast_image_resize::{
    images::Image, FilterType, MulDiv, PixelType, ResizeAlg, ResizeOptions,
    Resizer,
};
use image::{DynamicImage, GenericImageView};
use num_cpus;
use tauri::{AppHandle, Emitter};
use tokio::{
    sync::{mpsc, Semaphore},
    task,
};

use crate::models::file::{
    ImageFmt, ThumbPath, ThumbRequest, ThumbResInfo, ThumbResSpec,
    ThumbResponse, ThumbSpec, ThumbStatus,
};

use super::{
    folder::fetch_one_file_path,
    job_queue::{enqueue_jobs, finish_job, take_next_job, ThumbnailJob},
};

/// Version tag embedded in generated thumbnail paths.
pub const SCHEMA_VERSION: u8 = 1;

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
            let Some(job) = take_next_job().await else {
                break;
            };

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
        }
    }
}

/// Generate a thumbnail for the provided job and emit a completion event.
async fn process_job(app: &AppHandle, job: ThumbnailJob) -> Result<()> {
    let timer_all = Instant::now();

    let source_path =
        fetch_one_file_path(job.moa_id.clone(), job.xxhs.clone()).await?;

    let data =
        tokio::fs::read(&source_path).await.context("read source failed")?;
    let file_kind = infer::get_from_path(&source_path)
        .context("failed to read file")?
        .ok_or_else(|| anyhow!("unknown file type"))?;
    if !infer::is_image(file_kind.mime_type().as_bytes()) {
        bail!("unsupported mime type for thumbnail generation");
    }

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
            let (w, h) = image.dimensions();
            let target_w = target_width.max(1);
            let target_h = target_height.max(1);
            let rgba = image.to_rgba8();
            let (w, h) = rgba.dimensions();

            let scale = ((target_w as f32 / w as f32)
                .max(target_h as f32 / h as f32))
            .min(1.0);

            let nw = ((w as f32 * scale).round() as u32).max(1);
            let nh = ((h as f32 * scale).round() as u32).max(1);

            let mut src_image =
                Image::from_vec_u8(w, h, rgba.into_raw(), PixelType::U8x4)
                    .expect("Invalid source");

            let crop_w = target_w.min(nw);
            let crop_h = target_h.min(nh);
            let x = (nw.saturating_sub(crop_w)) / 2;
            let y = (nh.saturating_sub(crop_h)) / 2;

            let mut dst_image =
                Image::new(crop_w, crop_h, src_image.pixel_type());

            let mut resizer = Resizer::new();
            resizer
                .resize(
                    &src_image,
                    &mut dst_image,
                    &ResizeOptions::new()
                        .crop(x as f64, y as f64, crop_w as f64, crop_h as f64)
                        .resize_alg(ResizeAlg::Convolution(FilterType::Box)),
                )
                .expect("resize failed");

            (dst_image.into_vec(), crop_w, crop_h)
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
                Some(ImageFmt::Jpeg) => {
                    let mut encoder =
                        image::codecs::jpeg::JpegEncoder::new_with_quality(
                            &mut buf, 75,
                        );
                    encoder
                        .encode(&buffer, w, h, image::ExtendedColorType::Rgba8)
                        .context("jpeg encode failed")?;
                }
                _ => {
                    let mut encoder =
                        image::codecs::webp::WebPEncoder::new_lossless(
                            &mut buf,
                        );
                    encoder
                        .encode(&buffer, w, h, image::ExtendedColorType::Rgba8)
                        .context("webp encode failed")?;
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
        "[perf] decode: {:?} ms | resize: {:?} ms | encode: {:?} ms | total: {:?} ms",
        decode_elapsed.as_millis(),
        resize_elapsed.as_millis(),
        encode_elapsed.as_millis(),
        timer_all.elapsed().as_millis()
    );

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

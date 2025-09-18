use std::{
    collections::{HashSet, VecDeque},
    fmt::Debug,
    fs::File,
    hash::{Hash, Hasher},
    io::{self, BufReader, Read},
    path::{Path, PathBuf},
    sync::Arc,
    time::Instant,
};

use anyhow::{anyhow, bail, Context, Ok, Result};
use async_recursion::async_recursion;
use fast_image_resize::{
    images::Image, FilterType, MulDiv, PixelType, ResizeAlg, ResizeOptions,
    Resizer,
};
use image::{
    codecs::webp::WebPEncoder, DynamicImage, GenericImageView, ImageBuffer,
    ImageReader, Rgba,
};
use once_cell::sync::{Lazy, OnceCell};
use sha2::{Digest, Sha256};
use sqlx::{Sqlite, Transaction};
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, Mutex, Semaphore};
use twox_hash::XxHash64;

use crate::{
    bootstrap::PATH_MANAGER,
    db::repository::{
        file_repository::FileRepository, node_repository::NodeRepository,
        sroot_repository::SrootRepository,
    },
    models::{
        file::{
            FileInfo, FileType, FolderData, ImageFmt, RealFolderData,
            ThumbPath, ThumbRequest, ThumbResInfo, ThumbResSpec, ThumbResponse,
            ThumbSpec, ThumbStatus,
        },
        node::Node,
    },
    services::{
        db::DB_MANAGER,
        storage_root::{self, ensure_storage_root_and_real_folder},
    },
    utils::{file_utils::file_mtime_epoch, path_utils::normalize_path},
};

pub async fn create_folder(moa_id: String, data: FolderData) -> Result<Node> {
    let mut tx: Transaction<'_, Sqlite> =
        DB_MANAGER.create_new_tx(&moa_id).await?;

    let node = FileRepository::create_virtual_folder(
        tx.as_mut(),
        data.name,
        data.parent_id,
    )
    .await?;

    tx.commit().await?;

    Ok(node)
}

pub async fn first_mount_folder(
    moa_id: String,
    node: Node,
    path: String,
) -> Result<()> {
    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let norm_path = crate::utils::path_utils::normalize_path(&path);

    // storage root
    let sroot_info = storage_root::detect_storage_root(&norm_path)?;

    let real_folder_id =
        ensure_storage_root_and_real_folder(&mut tx, &sroot_info, &norm_path)
            .await?;

    let _mount_id = FileRepository::create_virtual_folder_mount(
        tx.as_mut(),
        node.id.clone(),
        real_folder_id.clone(),
    )
    .await?;

    upsert_folder(
        &mut tx,
        real_folder_id.clone(),
        node.id,
        &norm_path,
        true,
        Some(true),
    )
    .await?;

    let _scan_id = start_scan_job(moa_id.clone(), real_folder_id).await?;

    tx.commit().await?;

    Ok(())
}

pub async fn start_scan_job(
    _moa_id: String,
    _real_folder_id: String,
) -> Result<String> {
    Ok("".to_string())
}

// Scan Folder and Upser file and folder content
/// make_virtaul_folder: when reculrsive is false,
///                      if make_virtual_folder is true, create virtual folder for each sub folder
///                      if make_virtual_folder is false, not create virtual folder.
// TODO: Currently everything is in a single transaction.
//       Consider splitting mounts and file upserts into separate transactions
//       if performance or long-running locks become an issue.
#[async_recursion]
async fn upsert_folder(
    tx: &mut Transaction<'_, Sqlite>,
    parent_real_folder_id: String,
    parent_virtual_folder_id: String,
    abs_dir: &Path,
    recursive: bool,
    make_virtual_folder: Option<bool>,
) -> Result<()> {
    let make_vf = make_virtual_folder.unwrap_or(true);

    // Use async directory reading to avoid blocking the runtime
    let mut dir = tokio::fs::read_dir(abs_dir)
        .await
        .with_context(|| format!("failed to read_dir {:?}", abs_dir))?;

    let mut folder_entries: Vec<(PathBuf, String)> = Vec::new();
    while let Some(entry) = dir
        .next_entry()
        .await
        .with_context(|| format!("failed to read entry under {:?}", abs_dir))?
    {
        let entry_path: PathBuf = entry.path();

        // check file is hidden
        if check_is_hidden(&entry_path) {
            continue;
        };

        let file_type = entry.file_type().await.with_context(|| {
            format!("failed to get file_type for {:?}", entry_path)
        })?;
        // Avoid symlink loops (temp)
        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();

            if recursive {
                folder_entries.push((entry_path, name));
            } else if make_vf {
                // Only create virtual folders for direct child directories, do not mount.
                FileRepository::create_virtual_folder(
                    tx.as_mut(),
                    name,
                    parent_virtual_folder_id.clone(),
                )
                .await
                .with_context(|| {
                    format!("create_virtual_folder failed for {:?}", entry_path)
                })?;
            }
        } else if file_type.is_file() {
            upsert_file_entry(
                tx,
                &parent_real_folder_id,
                &parent_virtual_folder_id,
                &entry,
            )
            .await
            .map_err(|e| {
                anyhow!("upsert_file_entry failed for {:?} {}", entry_path, e)
            })?;
        } else {
            continue;
        }
    }
    //  ensure child real folder exists for this path
    let sroot_id: String = sqlx::query_scalar(
        "SELECT storage_root_id FROM real_folder
                     WHERE id = ?",
    )
    .bind(&parent_real_folder_id)
    .fetch_optional(tx.as_mut())
    .await
    .with_context(|| "failed to load storage_root for parent_real_folder_id")?
    .ok_or_else(|| {
        anyhow!("parent_real_folder_id not found: {}", parent_real_folder_id)
    })?;
    if recursive {
        for (entry_path, name) in folder_entries {
            // create child virtual folder node under the parent virtual folder
            let child_vf = FileRepository::create_virtual_folder(
                tx.as_mut(),
                name.clone(),
                parent_virtual_folder_id.clone(),
            )
            .await
            .with_context(|| {
                format!("create_virtual_folder failed for {:?}", entry_path)
            })?;

            // normalize child path
            let normalized = normalize_path(&entry_path);

            let child_real_folder_id =
                ensure_real_folder(tx, sroot_id.clone(), &normalized).await?;

            // mount child vf <-> child real folder
            FileRepository::create_virtual_folder_mount(
                tx.as_mut(),
                child_vf.id.clone(),
                child_real_folder_id.clone(),
            )
            .await
            .with_context(|| {
                format!("mount vf<->rf failed for {:?}", entry_path)
            })?;

            // recurse into the child directory
            if let Err(e) = upsert_folder(
                tx,
                child_real_folder_id,
                child_vf.id,
                &entry_path,
                recursive,
                Some(make_vf),
            )
            .await
            {
                println!("{}", e);
            };
        }
    };

    Ok(())
}

async fn upsert_file_entry(
    tx: &mut Transaction<'_, Sqlite>,
    parent_real_folder_id: &str,
    parent_virtual_folder_id: &str,
    entry: &tokio::fs::DirEntry,
) -> Result<()> {
    let file_name = entry.file_name().to_string_lossy().to_string();

    let file_path = entry.path();
    let file_info: FileInfo =
        FileInfo::new(&file_path, parent_real_folder_id.to_string(), file_name)
            .await?;

    let file_path_id =
        FileRepository::insert_file_path(tx.as_mut(), &file_info).await?;

    // upsert file_content
    let file_content_id =
        FileRepository::upsert_file_content(tx.as_mut(), &file_info).await?;

    NodeRepository::upsert_file_node(
        tx.as_mut(),
        parent_virtual_folder_id.to_string(),
        file_content_id.clone(),
    )
    .await?;
    // binding
    FileRepository::upsert_file_path_content_binding(
        tx.as_mut(),
        &file_path_id,
        &file_content_id,
    )
    .await?;

    Ok(())
}

pub async fn ensure_real_folder(
    tx: &mut Transaction<'_, Sqlite>,
    sroot_id: String,
    norm_path: &std::path::PathBuf,
) -> Result<String> {
    let mut current_parent_id: Option<String> = None;

    let mount_path = SrootRepository::fetch_mount_path(tx.as_mut(), &sroot_id)
        .await?
        .ok_or_else(|| anyhow!("Failed to fetch mount path"))?;

    let components_path =
        if let Result::Ok(sub_path) = norm_path.strip_prefix(&mount_path) {
            sub_path
        } else {
            norm_path
        };

    let components: Vec<&str> = if components_path.as_os_str().is_empty() {
        vec![""]
    } else {
        components_path
            .components()
            .filter_map(|c| c.as_os_str().to_str())
            .filter(|s| !s.is_empty())
            .collect()
    };

    let mut rel_path = PathBuf::from("");
    let mut abs_path = PathBuf::from(&mount_path);

    let now = crate::utils::date::get_now_date();

    for component in components {
        abs_path.push(component);
        rel_path.push(component);

        let metadata = tokio::fs::metadata(&abs_path).await?;
        let mtime = file_mtime_epoch(&metadata)?;

        let data = RealFolderData {
            id: "".to_string(), // not needed for upsert
            storage_root_id: Some(sroot_id.to_owned()),
            parent_id: current_parent_id.clone(),
            name: component.to_string(),
            name_norm: component.to_lowercase(),
            root_rel_path: Some(rel_path.to_string_lossy().into_owned()),
            abs_path_cached: Some(abs_path.to_string_lossy().into_owned()),
            mtime: mtime,
            error_flag: crate::config::file::IntegrityCheckResult::Success,
            error_msg: None,
            last_seen_scan_id: None,
            last_seen_at: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        let id = FileRepository::upsert_real_folder(tx.as_mut(), &data).await?;
        current_parent_id = Some(id);
    }

    if let Some(id) = current_parent_id {
        Ok(id)
    } else {
        Err(anyhow::anyhow!("Failed to create or find real_folder ID"))
    }
}

pub async fn fetch_one_file_path(
    moa_id: String,
    xxhs: String,
) -> Result<PathBuf> {
    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let fc_id = FileRepository::find_file_content_id(tx.as_mut(), xxhs.clone())
        .await?
        .ok_or_else(|| {
            anyhow!("No file content found for xxh3_64: {}", xxhs)
        })?;

    let active_path_ids =
        FileRepository::fetch_matched_file_path_ids(tx.as_mut(), &fc_id)
            .await?;

    if active_path_ids.len() == 0 {
        return Err(anyhow!(
            "No active file path found for file content ID: {}",
            fc_id
        ));
    }

    // todo: select one path by some method
    let file_path_id = active_path_ids.first().unwrap();

    let Some(path) =
        FileRepository::fetch_file_abs_path_cached(tx.as_mut(), file_path_id)
            .await?
    else {
        return Err(anyhow!(
            "No file path found for file content ID: {}",
            fc_id
        ));
    };

    Ok(path)
}

pub const SCHEMA_VERSION: u8 = 1;

#[derive(Debug, Clone, Eq)]
struct JobKey {
    xxhs: String,
    thumb_key: String,
}

impl PartialEq for JobKey {
    fn eq(&self, other: &Self) -> bool {
        self.xxhs == other.xxhs && self.thumb_key == other.thumb_key
    }
}

impl Hash for JobKey {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.xxhs.hash(state);
        self.thumb_key.hash(state);
    }
}

impl From<&Job> for JobKey {
    fn from(j: &Job) -> Self {
        Self { xxhs: j.xxhs.clone(), thumb_key: j.thumb_key.clone() }
    }
}

#[derive(Debug, Clone)]
pub struct Job {
    pub moa_id: String,
    pub xxhs: String,
    pub thumb_key: String,
    pub spec: ThumbSpec,
    pub out_path: PathBuf,
    pub priority: u8, // 0 = high, 1 = low
}

// global state for queue
#[derive(Default)]
pub struct QueueState {
    // simple two-priority queues
    high: VecDeque<Job>,
    low: VecDeque<Job>,

    pending: HashSet<JobKey>, // jobs enqueued but not yet started
    inflight: HashSet<JobKey>, // jobs currently being processed
}

pub struct AppState {
    pub q: tokio::sync::Mutex<QueueState>,
    pub tx: OnceCell<mpsc::Sender<()>>,
}

pub static STATE: Lazy<Arc<AppState>> = Lazy::new(|| {
    Arc::new(AppState {
        q: Mutex::new(QueueState::default()),
        tx: OnceCell::new(),
    })
});

pub async fn get_thumbs(
    app: &AppHandle,
    moa_id: String,
    data: ThumbRequest,
) -> Result<ThumbResponse> {
    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let items = data.items;

    let mut response = ThumbResponse { items: Vec::new() };

    let mut to_generate: Vec<Job> = Vec::new();

    for item in items {
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
                Result::Ok(path) => path,
                Err(e) => {
                    // Push an error spec and skip to the next iteration.
                    res_specs.push(ThumbResSpec {
                        status: ThumbStatus::Error,
                        url: None,
                        thumb_key: spec.key.clone(),
                        enqueued: false,
                        error_msg: Some(e.to_string()),
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
            } else {
                to_generate.push(Job {
                    moa_id: moa_id.clone(),
                    xxhs: item.xxhs.clone(),
                    thumb_key: spec.key.clone(),
                    spec: spec.clone(),
                    out_path: thumb_path,
                    priority: 0, // high priority
                });
                res_specs.push(ThumbResSpec {
                    status: ThumbStatus::Miss,
                    url: None,
                    thumb_key: spec.key.clone(),
                    enqueued: true,
                    error_msg: None,
                });
            }
        }

        response.items.push(ThumbResInfo { xxhs: item.xxhs, specs: res_specs });
    }
    enqueue_jobs(to_generate).await;

    Ok(response)
}

async fn enqueue_jobs(mut jobs: Vec<Job>) {
    // Stable output dirs per job
    for j in &jobs {
        if let Some(parent) = j.out_path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
    }
    let st = STATE.clone();
    {
        let mut q = st.q.lock().await;
        // high first, then low
        for j in jobs.drain(..) {
            let key: JobKey = (&j).into();

            // skip if already pending or inflight
            if q.pending.contains(&key) || q.inflight.contains(&key) {
                continue;
            }

            // mark as pending and push to the appropriate queue
            q.pending.insert(key);
            if j.priority == 0 {
                q.high.push_back(j);
            } else {
                q.low.push_back(j);
            }
        }
    }
    if let Some(tx) = STATE.tx.get() {
        let _ = tx.try_send(());
    }
}
pub async fn worker_loop(app: AppHandle, mut rx: mpsc::Receiver<()>) {
    // allow N concurrent jobs (tune N per CPU & IO)
    let sem = Arc::new(Semaphore::new(num_cpus::get().max(2)));

    loop {
        let _ = rx.recv().await;

        loop {
            let job_opt = {
                let mut q = STATE.q.lock().await;
                let job = q.high.pop_front().or_else(|| q.low.pop_front());

                if let Some(ref j) = job {
                    let key: JobKey = j.into();
                    // move from pending -> inflight
                    q.pending.remove(&key);
                    q.inflight.insert(key);
                }
                job
            };

            let Some(job) = job_opt else {
                break;
            };

            let app_cloned = app.clone();
            let sem_cloned = sem.clone();

            tokio::spawn(async move {
                let _permit = sem_cloned.acquire().await.unwrap();
                let key: JobKey = (&job).into();

                let res = process_job(&app_cloned, job.clone()).await;

                // on finish, drop from inflight and emit error if any
                {
                    let mut q = STATE.q.lock().await;
                    q.inflight.remove(&key);
                }

                if let Err(err) = res {
                    let _ = emit_created(
                        &app_cloned,
                        vec![ThumbResSpec {
                            thumb_key: job.thumb_key,
                            status: ThumbStatus::Error,
                            url: None,
                            enqueued: false,
                            error_msg: Some(err.to_string()),
                        }],
                    )
                    .await;
                }
            });

            // small yield is not strictly needed when spawning
            tokio::task::yield_now().await;
        }
    }
}

async fn process_job(app: &AppHandle, job: Job) -> Result<()> {
    let t_all = Instant::now();

    let src = fetch_one_file_path(job.moa_id.clone(), job.xxhs).await?;

    // vaild
    let data: Vec<u8> =
        tokio::fs::read(&src).await.context("read source failed")?;
    let kind = infer::get_from_path(&src)
        .context("failed to read file")?
        .ok_or_else(|| anyhow::anyhow!("unknown file type"))?;
    if !infer::is_image(kind.mime_type().as_bytes()) { /* ... */ }
    let out_path = job.out_path.clone();
    let tmp = out_path.with_extension("tmp");

    // decode
    let t_decode_start = Instant::now();
    let img: DynamicImage = tokio::task::spawn_blocking({
        let data = data.clone();
        move || image::load_from_memory(&data).context("image decode failed")
    })
    .await
    .context("join error")??;
    let t_decode = t_decode_start.elapsed();

    // resize & crop
    let t_resize_start = Instant::now();
    let (tw, th) = (job.spec.width, job.spec.height);
    let (output_buf, out_w, out_h) =
        tokio::task::spawn_blocking(move || -> (Vec<u8>, u32, u32) {
            let (w, h) = img.dimensions();
            let target_w = tw.max(1);
            let target_h = th.max(1);
            let rgba = img.to_rgba8();
            let (w, h) = rgba.dimensions();

            let scale = ((target_w as f32 / w as f32)
                .max(target_h as f32 / h as f32))
            .min(1.0);

            let nw = ((w as f32 * scale).round() as u32).max(1);
            let nh = ((h as f32 * scale).round() as u32).max(1);

            let mut src_image =
                Image::from_vec_u8(w, h, rgba.into_raw(), PixelType::U8x4)
                    .expect("Invalid source buffer");

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
    let t_resize = t_resize_start.elapsed();

    // encode
    if let Some(parent) = job.out_path.parent() {
        tokio::fs::create_dir_all(parent).await?
    } else {
        bail!("bad output path")
    }
    let tmp_path = tmp.clone();

    let t_encode_start = Instant::now();
    tokio::task::spawn_blocking({
        let output_buf = output_buf;
        let (w, h) = (out_w, out_h);
        move || -> Result<()> {
            let mut buf = Vec::new();
            match job.spec.fmt {
                Some(ImageFmt::Jpeg) => {
                    let mut enc =
                        image::codecs::jpeg::JpegEncoder::new_with_quality(
                            &mut buf, 75,
                        );
                    enc.encode(
                        &output_buf,
                        w,
                        h,
                        image::ExtendedColorType::Rgba8,
                    )
                    .context("jpeg encode failed")?;
                }
                _ => {
                    let mut encoder =
                        image::codecs::webp::WebPEncoder::new_lossless(
                            &mut buf,
                        );
                    encoder
                        .encode(
                            &output_buf,
                            w,
                            h,
                            image::ExtendedColorType::Rgba8,
                        )
                        .context("webp encode failed")?;
                }
            }
            std::fs::write(&tmp_path, buf).context("write tmp failed")?;
            Ok(())
        }
    })
    .await??;
    let t_encode = t_encode_start.elapsed();

    // atomic rename
    tokio::fs::rename(&tmp, &out_path).await.context("rename failed")?;

    // emit event
    emit_created(
        app,
        vec![ThumbResSpec {
            thumb_key: job.thumb_key,
            status: ThumbStatus::Hit,
            url: Some(out_path.to_string_lossy().to_string()),
            enqueued: false,
            error_msg: None,
        }],
    )
    .await?;

    // --- 최종 성능 로그 ---
    println!(
        "[perf] decode: {:?} ms | resize: {:?} ms | encode: {:?} ms | total: {:?} ms",
        t_decode.as_millis(),
        t_resize.as_millis(),
        t_encode.as_millis(),
        t_all.elapsed().as_millis()
    );

    Ok(())
}

async fn emit_created(app: &AppHandle, items: Vec<ThumbResSpec>) -> Result<()> {
    #[derive(serde::Serialize, Clone)]
    struct ThumbEvent {
        items: Vec<ThumbResSpec>,
    }
    let payload = ThumbEvent { items };
    app.emit("thumbnails://created", payload).context("emit failed")?;
    Ok(())
}

// -- helper --

#[cfg(unix)]
pub fn check_is_hidden(path: &Path) -> bool {
    if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
        name.starts_with('.')
    } else {
        false
    }
}

#[cfg(windows)]
pub fn check_is_hidden(path: &Path) -> bool {
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::fileapi::GetFileAttributesW;
    use winapi::um::winnt::FILE_ATTRIBUTE_HIDDEN;

    let wide: Vec<u16> =
        path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        let attrs = GetFileAttributesW(wide.as_ptr());
        if attrs == u32::MAX {
            return false; // invalid path or error
        }
        (attrs & FILE_ATTRIBUTE_HIDDEN) != 0
    }
}

// -- hash --

// sha256
#[allow(dead_code)]
fn sha256_of(path: &Path) -> Result<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();

    io::copy(&mut reader, &mut hasher)?;
    Ok(format!("{:x}", hasher.finalize()))
}

#[allow(dead_code)]
pub fn sha256_of_img(path: &Path) -> Result<String> {
    if !matches!(FileType::from(path), FileType::Image) {
        bail!("Not an image file: {}", path.display());
    }
    FileType::check_is_img(path)?;

    sha256_of(path)
}

// xxhash

pub fn xxh3_64_of(path: &Path) -> Result<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = XxHash64::default();

    let mut buffer = [0u8; 8192]; // 8KB 버퍼
    loop {
        let n = reader.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.write(&buffer[..n]);
    }

    Ok(format!("{:016x}", hasher.finish()))
}

pub fn _xxh3_644_of_img(path: &Path) -> Result<String> {
    if !matches!(FileType::from(path), FileType::Image) {
        bail!("Not an image file: {}", path.display());
    }
    FileType::check_is_img(path)?;
    xxh3_64_of(path)
}

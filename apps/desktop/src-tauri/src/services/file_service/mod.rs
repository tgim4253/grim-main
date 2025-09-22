//! Async helpers for importing folders, hashing files, and rendering thumbnails.

pub mod folder;
pub mod hash;
pub mod job_queue;
pub mod settings;
pub mod thumbnail;
pub mod utils;

pub use folder::{
    collect_folder_preview, create_folder, ensure_real_folder,
    first_mount_folder, start_scan_job,
};
pub use hash::{sha256_of_img, xxh3_64_of};
pub use job_queue::{
    ThumbnailJob, ThumbnailWorkerState, THUMBNAIL_WORKER_STATE,
};
pub use thumbnail::{get_thumbs, worker_loop};

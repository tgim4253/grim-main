//! Async helpers for importing folders, hashing files, and rendering thumbnails.

pub mod cache;
pub mod folder;
pub mod hash;
pub mod job_queue;
pub mod thumbnail;
pub mod utils;

pub use cache::{
    clear_base_thumb_cache, clear_derived_thumb_cache,
    collect_thumb_cache_usage, ThumbCacheUsage,
};
pub use folder::{
    collect_folder_preview, create_folder, ensure_real_folder,
    first_mount_folder, start_scan_job,
};
pub use hash::{sha256_of_img, xxh3_64_of};
pub use job_queue::{
    ThumbnailJob, ThumbnailWorkerState, THUMBNAIL_WORKER_STATE,
};
pub use thumbnail::{get_thumbs, worker_loop};

//! Async helpers for importing folders, hashing files, and rendering thumbnails.

pub mod cache;
pub mod folder;
pub mod hash;
pub mod job_queue;
pub mod scan;
pub mod thumbnail;
pub mod utils;

pub use cache::{
    clear_base_thumb_cache, clear_derived_thumb_cache,
    collect_thumb_cache_usage, ThumbCacheUsage,
};
pub use folder::{
    collect_folder_preview, create_folder, ensure_real_folder,
    first_mount_folder, sync_virtual_folder, update_virtual_folder_options,
};
pub use hash::xxh3_64_of;
pub use job_queue::THUMBNAIL_WORKER_STATE;
pub use scan::{
    init_worker as init_scan_worker, worker_loop as scan_worker_loop,
    SCAN_WORKER_STATE,
};
pub use thumbnail::{get_thumbs, worker_loop as thumbnail_worker_loop};

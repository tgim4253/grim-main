use std::{
    collections::{HashMap, HashSet, VecDeque},
    hash::{Hash, Hasher},
    path::PathBuf,
    sync::Arc,
};

use once_cell::sync::{Lazy, OnceCell};
use tokio::{
    fs,
    sync::{mpsc, Mutex},
};

use crate::models::file::ThumbSpec;

/// Background job used to pre-render base thumbnails for file hashes.
#[derive(Debug, Clone)]
pub struct BaseThumbnailJob {
    pub moa_id: String,
    pub xxhs: String,
    pub source_path: PathBuf,
}

/// Key used to track pending and inflight jobs.
#[derive(Debug, Clone, Eq)]
pub struct ThumbnailJobKey {
    pub xxhs: String,
    pub thumb_key: String,
}

impl PartialEq for ThumbnailJobKey {
    fn eq(&self, other: &Self) -> bool {
        self.xxhs == other.xxhs && self.thumb_key == other.thumb_key
    }
}

impl Hash for ThumbnailJobKey {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.xxhs.hash(state);
        self.thumb_key.hash(state);
    }
}

impl From<&ThumbnailJob> for ThumbnailJobKey {
    fn from(job: &ThumbnailJob) -> Self {
        Self { xxhs: job.xxhs.clone(), thumb_key: job.thumb_key.clone() }
    }
}

/// Thumbnail generation job queued for background processing.
#[derive(Debug, Clone)]
pub struct ThumbnailJob {
    pub moa_id: String,
    pub xxhs: String,
    pub thumb_key: String,
    pub spec: ThumbSpec,
    pub out_path: PathBuf,
    pub priority: u8,
}

#[derive(Default)]
pub struct ThumbnailQueue {
    pub high: VecDeque<ThumbnailJob>,
    pub low: VecDeque<ThumbnailJob>,
    pub pending: HashSet<ThumbnailJobKey>,
    pub inflight: HashSet<ThumbnailJobKey>,
}

impl ThumbnailQueue {
    fn cancel_by_moa(&mut self, moa_id: &str) {
        let mut removed = HashSet::new();

        for job in self.high.iter().filter(|job| job.moa_id == moa_id) {
            removed.insert(ThumbnailJobKey {
                xxhs: job.xxhs.clone(),
                thumb_key: job.thumb_key.clone(),
            });
        }

        for job in self.low.iter().filter(|job| job.moa_id == moa_id) {
            removed.insert(ThumbnailJobKey {
                xxhs: job.xxhs.clone(),
                thumb_key: job.thumb_key.clone(),
            });
        }

        self.high.retain(|job| job.moa_id != moa_id);
        self.low.retain(|job| job.moa_id != moa_id);
        self.pending.retain(|key| !removed.contains(key));
    }
}

#[derive(Default)]
pub struct BaseThumbnailQueue {
    pub queue: VecDeque<BaseThumbnailJob>,
    pub pending: HashMap<String, String>,
    pub inflight: HashMap<String, String>,
}

impl BaseThumbnailQueue {
    fn cancel_by_moa(&mut self, moa_id: &str) {
        self.queue.retain(|job| job.moa_id != moa_id);
        self.pending.retain(|_, pending_moa| pending_moa != moa_id);
        self.inflight.retain(|_, inflight_moa| inflight_moa != moa_id);
    }
}

/// Shared state for the thumbnail worker queue.
pub struct ThumbnailWorkerState {
    pub queue: Mutex<ThumbnailQueue>,
    pub base_queue: Mutex<BaseThumbnailQueue>,
    pub active_moas: Mutex<HashSet<String>>,
    pub signal: OnceCell<mpsc::Sender<()>>,
}

impl Default for ThumbnailWorkerState {
    fn default() -> Self {
        Self {
            queue: Mutex::new(ThumbnailQueue::default()),
            base_queue: Mutex::new(BaseThumbnailQueue::default()),
            active_moas: Mutex::new(HashSet::new()),
            signal: OnceCell::new(),
        }
    }
}

pub static THUMBNAIL_WORKER_STATE: Lazy<Arc<ThumbnailWorkerState>> =
    Lazy::new(|| Arc::new(ThumbnailWorkerState::default()));

/// Queue the provided jobs and notify the worker loop.
pub async fn enqueue_jobs(mut jobs: Vec<ThumbnailJob>) {
    for job in &jobs {
        if let Some(parent) = job.out_path.parent() {
            let _ = fs::create_dir_all(parent).await;
        }
    }

    let state = THUMBNAIL_WORKER_STATE.clone();
    let active_moas = { state.active_moas.lock().await.clone() };
    {
        let mut queue = state.queue.lock().await;
        for job in jobs.drain(..) {
            if !active_moas.contains(&job.moa_id) {
                continue;
            }
            let key: ThumbnailJobKey = (&job).into();
            if queue.pending.contains(&key) || queue.inflight.contains(&key) {
                continue;
            }

            queue.pending.insert(key);
            if job.priority == 0 {
                queue.high.push_back(job);
            } else {
                queue.low.push_back(job);
            }
        }
    }

    if let Some(tx) = state.signal.get() {
        let _ = tx.try_send(());
    }
}

/// Queue a base thumbnail job if one is not already pending or in-flight.
pub async fn enqueue_base_job(job: BaseThumbnailJob) {
    let state = THUMBNAIL_WORKER_STATE.clone();

    {
        let mut queue = state.base_queue.lock().await;

        if queue.inflight.contains_key(&job.xxhs) {
            return;
        }

        if queue.pending.contains_key(&job.xxhs) {
            queue.pending.insert(job.xxhs.clone(), job.moa_id.clone());
            if let Some(existing) =
                queue.queue.iter_mut().find(|item| item.xxhs == job.xxhs)
            {
                *existing = job;
            }
            return;
        }

        queue.pending.insert(job.xxhs.clone(), job.moa_id.clone());
        queue.queue.push_back(job);
    }

    if let Some(tx) = state.signal.get() {
        let _ = tx.try_send(());
    }
}

/// Take the next job from the queue, prioritising high priority jobs.
pub async fn take_next_job() -> Option<ThumbnailJob> {
    let mut queue = THUMBNAIL_WORKER_STATE.queue.lock().await;
    let job = queue.high.pop_back().or_else(|| queue.low.pop_back());

    if let Some(ref job) = job {
        let key: ThumbnailJobKey = job.into();
        queue.pending.remove(&key);
        queue.inflight.insert(key);
    }

    job
}

/// Mark a job as finished so it can be removed from the inflight set.
pub async fn finish_job(job: &ThumbnailJob) {
    let key: ThumbnailJobKey = job.into();
    let mut queue = THUMBNAIL_WORKER_STATE.queue.lock().await;
    queue.inflight.remove(&key);
}

/// Take the next base thumbnail job from the queue.
pub async fn take_next_base_job() -> Option<BaseThumbnailJob> {
    let mut queue = THUMBNAIL_WORKER_STATE.base_queue.lock().await;
    let job = queue.queue.pop_back();

    if let Some(ref job) = job {
        queue.pending.remove(&job.xxhs);
        queue.inflight.insert(job.xxhs.clone(), job.moa_id.clone());
    }

    job
}

/// Mark a base thumbnail job as finished.
pub async fn finish_base_job(job: &BaseThumbnailJob) {
    let mut queue = THUMBNAIL_WORKER_STATE.base_queue.lock().await;
    queue.inflight.remove(&job.xxhs);
}

/// Cancel a pending base thumbnail job for the provided hash if it exists.
pub async fn cancel_pending_base_job(hash: &str) {
    let mut queue = THUMBNAIL_WORKER_STATE.base_queue.lock().await;

    if queue.pending.remove(hash).is_some() {
        queue.queue.retain(|job| job.xxhs != hash);
    }
}

/// Mark the provided Moa as having an open window so jobs can be processed.
pub async fn register_moa_window(moa_id: &str) {
    let state = THUMBNAIL_WORKER_STATE.clone();
    {
        let mut active = state.active_moas.lock().await;
        if active.insert(moa_id.to_string()) {
            if let Some(tx) = state.signal.get() {
                let _ = tx.try_send(());
            }
        }
    }
}

/// Remove the Moa from the active set and cancel any queued jobs for it.
pub async fn unregister_moa_window(moa_id: &str) {
    let state = THUMBNAIL_WORKER_STATE.clone();

    {
        let mut active = state.active_moas.lock().await;
        active.remove(moa_id);
    }

    {
        let mut queue = state.queue.lock().await;
        queue.cancel_by_moa(moa_id);
    }

    {
        let mut base_queue = state.base_queue.lock().await;
        base_queue.cancel_by_moa(moa_id);
    }
}

use std::{
    collections::{HashSet, VecDeque},
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

/// Key used to track pending and inflight jobs.
#[derive(Debug, Clone, Eq)]
struct ThumbnailJobKey {
    xxhs: String,
    thumb_key: String,
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
struct ThumbnailQueue {
    high: VecDeque<ThumbnailJob>,
    low: VecDeque<ThumbnailJob>,
    pending: HashSet<ThumbnailJobKey>,
    inflight: HashSet<ThumbnailJobKey>,
}

/// Shared state for the thumbnail worker queue.
pub struct ThumbnailWorkerState {
    pub queue: Mutex<ThumbnailQueue>,
    pub signal: OnceCell<mpsc::Sender<()>>,
}

impl Default for ThumbnailWorkerState {
    fn default() -> Self {
        Self {
            queue: Mutex::new(ThumbnailQueue::default()),
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
    {
        let mut queue = state.queue.lock().await;
        for job in jobs.drain(..) {
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

/// Take the next job from the queue, prioritising high priority jobs.
pub async fn take_next_job() -> Option<ThumbnailJob> {
    let mut queue = THUMBNAIL_WORKER_STATE.queue.lock().await;
    let job = queue.high.pop_front().or_else(|| queue.low.pop_front());

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

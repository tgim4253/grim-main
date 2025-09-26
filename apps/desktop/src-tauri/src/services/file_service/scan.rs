use std::{
    collections::{HashSet, VecDeque},
    path::PathBuf,
    sync::Arc,
    time::Duration,
};

use anyhow::{anyhow, Result};
use once_cell::sync::{Lazy, OnceCell};
use sqlx::Row;
use tauri::AppHandle;
use tokio::{
    fs,
    sync::{mpsc, Mutex},
    time,
};
use tracing::warn;

use crate::{
    models::file::FileInfo,
    services::db::DB_MANAGER,
    utils::{date::get_now_date, identifier::get_unique_id},
};

use super::folder::sync_virtual_folder;

const RESCAN_INTERVAL: Duration = Duration::from_secs(60);

#[derive(Clone, Debug, Eq, PartialEq, Hash)]
struct ScanJobKey {
    moa_id: String,
    real_folder_id: String,
}

#[derive(Clone, Debug)]
pub struct ScanJob {
    key: ScanJobKey,
    initial_scan_id: Option<String>,
}

impl ScanJob {
    fn new(
        moa_id: String,
        real_folder_id: String,
        scan_id: Option<String>,
    ) -> Self {
        Self {
            key: ScanJobKey { moa_id, real_folder_id },
            initial_scan_id: scan_id,
        }
    }

    fn with_next_scan(&self) -> Self {
        Self::new(
            self.key.moa_id.clone(),
            self.key.real_folder_id.clone(),
            None,
        )
    }
}

#[derive(Default)]
struct ScanQueue {
    queue: VecDeque<ScanJob>,
    pending: HashSet<ScanJobKey>,
    inflight: HashSet<ScanJobKey>,
}

pub struct ScanWorkerState {
    pub queue: Mutex<ScanQueue>,
    pub signal: OnceCell<mpsc::Sender<()>>,
    pub app_handle: OnceCell<AppHandle>,
}

impl Default for ScanWorkerState {
    fn default() -> Self {
        Self {
            queue: Mutex::new(ScanQueue::default()),
            signal: OnceCell::new(),
            app_handle: OnceCell::new(),
        }
    }
}

pub static SCAN_WORKER_STATE: Lazy<Arc<ScanWorkerState>> =
    Lazy::new(|| Arc::new(ScanWorkerState::default()));

pub fn init_worker(app: &AppHandle) -> Result<()> {
    SCAN_WORKER_STATE
        .app_handle
        .set(app.clone())
        .map_err(|_| anyhow!("scan worker already initialised"))
}

pub async fn queue_scan_job(
    moa_id: String,
    real_folder_id: String,
    scan_id: Option<String>,
) {
    enqueue_job(ScanJob::new(moa_id, real_folder_id, scan_id)).await;
}

async fn enqueue_job(job: ScanJob) {
    let state = SCAN_WORKER_STATE.clone();

    {
        let mut guard = state.queue.lock().await;
        let key = job.key.clone();
        if guard.pending.contains(&key) || guard.inflight.contains(&key) {
            return;
        }

        guard.pending.insert(key);
        guard.queue.push_back(job);
    }

    if let Some(tx) = state.signal.get() {
        let _ = tx.try_send(());
    }
}

async fn take_next_job() -> Option<ScanJob> {
    let mut guard = SCAN_WORKER_STATE.queue.lock().await;
    let job = guard.queue.pop_front();

    if let Some(ref job) = job {
        guard.pending.remove(&job.key);
        guard.inflight.insert(job.key.clone());
    }

    job
}

async fn finish_job(job: &ScanJob) {
    let mut guard = SCAN_WORKER_STATE.queue.lock().await;
    guard.inflight.remove(&job.key);
}

pub async fn worker_loop(mut rx: mpsc::Receiver<()>) {
    loop {
        let _ = rx.recv().await;

        loop {
            let Some(job) = take_next_job().await else {
                break;
            };

            let continue_running = match process_job(&job).await {
                Ok(flag) => flag,
                Err(err) => {
                    warn!(
                        "scan worker failed for folder {} in moa {}: {}",
                        job.key.real_folder_id, job.key.moa_id, err
                    );
                    true
                }
            };

            finish_job(&job).await;

            if continue_running {
                let next_job = job.with_next_scan();
                tokio::spawn(async move {
                    time::sleep(RESCAN_INTERVAL).await;
                    enqueue_job(next_job).await;
                });
            }
        }
    }
}

async fn process_job(job: &ScanJob) -> Result<bool> {
    let app_handle = SCAN_WORKER_STATE
        .app_handle
        .get()
        .cloned()
        .ok_or_else(|| anyhow!("scan worker not initialised"))?;

    let scan_id = job.initial_scan_id.clone().unwrap_or_else(get_unique_id);
    let started_at = get_now_date();

    {
        let mut tx = DB_MANAGER.create_new_tx(&job.key.moa_id).await?;
        sqlx::query(
            r#"
            INSERT INTO scan_session (id, started_at)
            VALUES (?, ?)
            "#,
        )
        .bind(&scan_id)
        .bind(&started_at)
        .execute(tx.as_mut())
        .await?;
        tx.commit().await?;
    }

    let folder_row = {
        let mut tx = DB_MANAGER.create_new_tx(&job.key.moa_id).await?;
        let folder = sqlx::query(
            r#"
            SELECT abs_path_cached, mtime
              FROM real_folder
             WHERE id = ?
            "#,
        )
        .bind(&job.key.real_folder_id)
        .fetch_optional(tx.as_mut())
        .await?;

        let mounts = sqlx::query(
            r#"
            SELECT virtual_node_id, sync_enabled
              FROM virtual_folder_mount
             WHERE real_folder_id = ?
               AND enabled = 1
            "#,
        )
        .bind(&job.key.real_folder_id)
        .fetch_all(tx.as_mut())
        .await?;

        tx.commit().await?;

        (folder, mounts)
    };

    let (folder_opt, mounts) = folder_row;

    let folder = match folder_opt {
        Some(row) => row,
        None => {
            let mut tx = DB_MANAGER.create_new_tx(&job.key.moa_id).await?;
            let finished = get_now_date();
            sqlx::query(
                r#"
                UPDATE scan_session
                   SET finished_at = ?,
                       note = ?
                 WHERE id = ?
                "#,
            )
            .bind(&finished)
            .bind(Some("real folder missing".to_string()))
            .bind(&scan_id)
            .execute(tx.as_mut())
            .await?;
            tx.commit().await?;

            return Ok(false);
        }
    };

    let abs_path: Option<String> = folder.get("abs_path_cached");
    let stored_mtime: i64 = folder.get("mtime");

    let mut status = "success";
    let mut error_msg: Option<String> = None;
    let mut current_mtime = stored_mtime;

    if let Some(path) = abs_path {
        let pb = PathBuf::from(path.clone());
        match fs::metadata(&pb).await {
            Ok(meta) => {
                current_mtime = FileInfo::file_mtime_epoch(&meta)?;
                if current_mtime != stored_mtime {
                    status = "mismatch";
                    error_msg = Some("Detected filesystem changes".to_string());

                    let mut sync_succeeded = true;

                    for mount in mounts.iter() {
                        let sync_enabled =
                            mount.get::<i64, _>("sync_enabled") != 0;
                        if !sync_enabled {
                            continue;
                        }

                        let virtual_node_id =
                            mount.get::<String, _>("virtual_node_id");
                        if let Err(err) = sync_virtual_folder(
                            &app_handle,
                            &job.key.moa_id,
                            &virtual_node_id,
                        )
                        .await
                        {
                            warn!(
                                "sync failed for {} on {}: {}",
                                &job.key.real_folder_id, &job.key.moa_id, err
                            );
                            error_msg = Some(format!("Sync failed: {}", err));
                            sync_succeeded = false;
                            break;
                        }
                    }

                    if sync_succeeded {
                        match fs::metadata(&pb).await {
                            Ok(updated) => {
                                current_mtime =
                                    FileInfo::file_mtime_epoch(&updated)?;
                                status = "success";
                                error_msg = None;
                            }
                            Err(err) => {
                                status = "notfound";
                                error_msg = Some(err.to_string());
                            }
                        }
                    }
                }
            }
            Err(err) => {
                status = "notfound";
                error_msg = Some(err.to_string());
            }
        }
    } else {
        status = "notfound";
        error_msg = Some("Missing cached path for mounted folder".to_string());
    }

    let finished = get_now_date();

    {
        let mut tx = DB_MANAGER.create_new_tx(&job.key.moa_id).await?;
        sqlx::query(
            r#"
            UPDATE real_folder
               SET error_flag = ?,
                   error_msg = ?,
                   last_seen_scan_id = ?,
                   last_seen_at = ?,
                   updated_at = ?
             WHERE id = ?
            "#,
        )
        .bind(status)
        .bind(&error_msg)
        .bind(&scan_id)
        .bind(&finished)
        .bind(&finished)
        .bind(&job.key.real_folder_id)
        .execute(tx.as_mut())
        .await?;

        if status == "success" {
            sqlx::query(
                r#"
                UPDATE real_folder
                   SET mtime = ?,
                       updated_at = ?
                 WHERE id = ?
                "#,
            )
            .bind(current_mtime)
            .bind(&finished)
            .bind(&job.key.real_folder_id)
            .execute(tx.as_mut())
            .await?;
        }

        tx.commit().await?;
    }

    {
        let mut tx = DB_MANAGER.create_new_tx(&job.key.moa_id).await?;
        sqlx::query(
            r#"
            UPDATE scan_session
               SET finished_at = ?,
                   note = ?
             WHERE id = ?
            "#,
        )
        .bind(&finished)
        .bind(&error_msg)
        .bind(&scan_id)
        .execute(tx.as_mut())
        .await?;
        tx.commit().await?;
    }

    Ok(true)
}

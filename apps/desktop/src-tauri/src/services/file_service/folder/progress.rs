use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum ImportState {
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FolderImportProgressPayload {
    folder_id: String,
    state: ImportState,
    processed_bytes: u64,
    total_bytes: Option<u64>,
    processed_files: u64,
    total_files: Option<u64>,
    elapsed_ms: u64,
}

pub(super) struct ImportProgressTracker {
    app_handle: AppHandle,
    moa_id: String,
    folder_id: String,
    total_bytes: Option<u64>,
    total_files: Option<u64>,
    processed_bytes: u64,
    processed_files: u64,
    started_at: Instant,
}

impl ImportProgressTracker {
    pub(super) fn new(
        app_handle: AppHandle,
        moa_id: String,
        folder_id: String,
        total_bytes: Option<u64>,
        total_files: Option<u64>,
    ) -> Self {
        Self {
            app_handle,
            moa_id,
            folder_id,
            total_bytes,
            total_files,
            processed_bytes: 0,
            processed_files: 0,
            started_at: Instant::now(),
        }
    }

    pub(super) fn emit(&self, state: ImportState) {
        let elapsed = self.started_at.elapsed().as_millis();
        let elapsed_ms = if elapsed > u128::from(u64::MAX) {
            u64::MAX
        } else {
            elapsed as u64
        };

        let payload = FolderImportProgressPayload {
            folder_id: self.folder_id.clone(),
            state,
            processed_bytes: self.processed_bytes,
            total_bytes: self.total_bytes,
            processed_files: self.processed_files,
            total_files: self.total_files,
            elapsed_ms,
        };

        let topic = format!("folder-import://progress/{}", self.moa_id);
        let _ = self.app_handle.emit(&topic, payload);
    }

    pub(super) fn notify_start(&self) {
        self.emit(ImportState::Running);
    }

    pub(super) fn record_file(&mut self, bytes: Option<i64>) {
        self.processed_files = self.processed_files.saturating_add(1);
        if let Some(size) = bytes {
            if size > 0 {
                self.processed_bytes =
                    self.processed_bytes.saturating_add(size as u64);
            }
        }
        self.emit(ImportState::Running);
    }

    pub(super) fn finish(&mut self) {
        if let Some(total) = self.total_bytes {
            if self.processed_bytes < total {
                self.processed_bytes = total;
            }
        } else {
            self.total_bytes = Some(self.processed_bytes);
        }

        if let Some(total) = self.total_files {
            if self.processed_files < total {
                self.processed_files = total;
            }
        } else {
            self.total_files = Some(self.processed_files);
        }

        self.emit(ImportState::Completed);
    }

    pub(super) fn fail(&self) {
        self.emit(ImportState::Failed);
    }
}

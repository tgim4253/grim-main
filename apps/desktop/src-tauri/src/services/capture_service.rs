use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, Result};
use tauri::Emitter;
use tokio::fs;

use crate::{
    app_launcher,
    models::capture::{
        CaptureContext, CaptureMonitor, CaptureOverlayPayload, CapturePreview,
        CaptureRect,
    },
    services::{AssetService, RecordService},
    utils::{
        file_ops::{decode_data_url, ensure_unique_path},
        media, screen_capture,
    },
};

#[derive(Clone)]
pub struct CaptureService {
    asset_service: AssetService,
    record_service: RecordService,
}

impl CaptureService {
    pub fn new(
        asset_service: AssetService,
        record_service: RecordService,
    ) -> Self {
        Self { asset_service, record_service }
    }

    pub async fn open_capture_overlay(
        &self,
        app_handle: &tauri::AppHandle,
        source_window: &tauri::WebviewWindow,
        payload: CaptureOverlayPayload,
    ) -> Result<()> {
        open_capture_overlay(app_handle, source_window, payload).await
    }

    pub async fn render_capture_preview(
        &self,
        rect: CaptureRect,
        monitor: CaptureMonitor,
    ) -> Result<CapturePreview> {
        screen_capture::render_capture_preview(rect, monitor).await
    }

    pub async fn confirm_capture(
        &self,
        app_handle: &tauri::AppHandle,
        base_url: String,
        context: CaptureContext,
    ) -> Result<()> {
        self.confirm_capture_inner(app_handle, base_url, context).await
    }

    async fn confirm_capture_inner(
        &self,
        app_handle: &tauri::AppHandle,
        base_url: String,
        context: CaptureContext,
    ) -> Result<()> {
        if base_url.is_empty() {
            bail!("Capture payload is empty");
        }

        let (bytes, extension) = decode_data_url(&base_url)?;
        let extension = extension.unwrap_or_else(|| "png".to_string());
        let record_id = context
            .record_id
            .as_deref()
            .ok_or_else(|| anyhow!("Capture requires a record id"))?;
        let existing_record = self.record_service.get_record(record_id).await?;
        if existing_record.record.finished_at.is_none() {
            bail!("Capture requires a finished record");
        }
        let file_name = format!("capture-{record_id}.{extension}");

        let result_asset = self
            .asset_service
            .import_capture_result(&bytes, &file_name)
            .await?;

        let record = self
            .record_service
            .attach_result_asset(
                record_id,
                &result_asset.id,
                context.actual_seconds,
            )
            .await?;

        if let Err(err) = persist_capture_result_to_requested_path(
            &bytes,
            context.result_save_path.as_deref(),
            &file_name,
        )
        .await
        {
            eprintln!(
                "Failed to persist capture result to requested path: {err:#}"
            );
        }

        #[derive(serde::Serialize, Clone)]
        #[serde(rename_all = "camelCase")]
        struct CaptureCompletedPayload {
            record_id: String,
            result_asset_id: String,
        }

        let payload = CaptureCompletedPayload {
            record_id: record.record.id,
            result_asset_id: result_asset.id,
        };

        app_handle.emit("capture://completed", payload).map_err(|err| {
            anyhow!("Failed to emit capture completion event: {err}")
        })?;

        Ok(())
    }
}

async fn persist_capture_result_to_requested_path(
    bytes: &[u8],
    result_save_path: Option<&str>,
    file_name: &str,
) -> Result<()> {
    let Some(raw_path) =
        result_save_path.map(str::trim).filter(|path| !path.is_empty())
    else {
        return Ok(());
    };

    let requested_path = PathBuf::from(raw_path);
    let destination =
        resolve_result_destination(&requested_path, file_name).await;
    let destination = ensure_unique_path(destination).await?;
    media::persist_bytes(&destination, bytes).await?;

    Ok(())
}

async fn resolve_result_destination(
    requested_path: &Path,
    file_name: &str,
) -> PathBuf {
    if fs::metadata(requested_path)
        .await
        .map(|metadata| metadata.is_dir())
        .unwrap_or(false)
        || requested_path.extension().is_none()
    {
        return requested_path.join(file_name);
    }

    requested_path.to_path_buf()
}

/// Launch the transparent capture overlay used to select screen regions.
pub async fn open_capture_overlay(
    app_handle: &tauri::AppHandle,
    source_window: &tauri::WebviewWindow,
    payload: CaptureOverlayPayload,
) -> Result<()> {
    app_launcher::capture::launch_capture_overlay(
        app_handle,
        source_window,
        &payload,
    )
    .map_err(|err| anyhow!(err))?;

    Ok(())
}

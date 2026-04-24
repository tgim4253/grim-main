use anyhow::{anyhow, bail, Result};
use tauri::Emitter;

use crate::{
    app_launcher,
    models::{
        capture::{
            CaptureContext, CaptureMonitor, CaptureOverlayPayload,
            CapturePreview, CaptureRect,
        },
        record::SaveCroquisRecordPayload,
    },
    services::{AssetService, RecordService},
    utils::{file_ops::decode_data_url, screen_capture},
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
        payload: CaptureOverlayPayload,
    ) -> Result<()> {
        open_capture_overlay(app_handle, payload).await
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
        if let Some(record_id) = context.record_id.as_deref() {
            let _ = self.record_service.get_record(record_id).await?;
        }
        let file_name = context
            .record_id
            .as_ref()
            .map(|record_id| format!("capture-{record_id}.{extension}"))
            .unwrap_or_else(|| {
                format!(
                    "capture-{}.{}",
                    chrono::Local::now().format("%Y%m%d-%H%M%S"),
                    extension
                )
            });

        let result_asset = self
            .asset_service
            .import_capture_result(&bytes, &file_name)
            .await?;

        let record = match context.record_id.as_deref() {
            Some(record_id) => {
                self.record_service
                    .attach_result_asset(
                        record_id,
                        &result_asset.id,
                        context.actual_seconds,
                    )
                    .await?
            }
            None => {
                self.record_service
                    .save_record(SaveCroquisRecordPayload {
                        id: None,
                        source_asset_id: context.asset_id.clone(),
                        result_asset_id: Some(result_asset.id.clone()),
                        title: Some("Captured Result".to_string()),
                        note: None,
                        target_duration_seconds: context.target_seconds,
                        tag_ids: Vec::new(),
                    })
                    .await?
            }
        };

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

/// Launch the transparent capture overlay used to select screen regions.
pub async fn open_capture_overlay(
    app_handle: &tauri::AppHandle,
    payload: CaptureOverlayPayload,
) -> Result<()> {
    app_launcher::capture::launch_capture_overlay(app_handle, &payload)
        .map_err(|err| anyhow!(err))?;

    Ok(())
}

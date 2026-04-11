use anyhow::Result;

use crate::{
    models::record::{
        CroquisRecordDetail, CroquisRecordSummary, DeleteCroquisRecordPayload,
        FinalizeCroquisRecordPayload, SaveCroquisRecordPayload,
        UpdateCroquisRecordTagsPayload,
    },
    repositories::{AssetRepository, RecordRepository},
};

#[derive(Clone)]
pub struct RecordService {
    record_repository: RecordRepository,
    asset_repository: AssetRepository,
}

impl RecordService {
    pub fn new(
        record_repository: RecordRepository,
        asset_repository: AssetRepository,
    ) -> Self {
        Self { record_repository, asset_repository }
    }

    pub async fn list_recent_records(
        &self,
        limit: i64,
    ) -> Result<Vec<CroquisRecordSummary>> {
        self.record_repository.list_recent(limit).await
    }

    pub async fn list_records_by_session(
        &self,
        session_id: &str,
    ) -> Result<Vec<CroquisRecordSummary>> {
        self.record_repository.list_by_session(session_id).await
    }

    pub async fn get_record(
        &self,
        record_id: &str,
    ) -> Result<CroquisRecordDetail> {
        let mut detail = self.record_repository.get_detail(record_id).await?;

        if let Some(source_asset_id) = detail.record.source_asset_id.clone() {
            detail.source_asset = Some(
                self.asset_repository.get_summary(&source_asset_id).await?,
            );
        }
        if let Some(result_asset_id) = detail.record.result_asset_id.clone() {
            detail.result_asset = Some(
                self.asset_repository.get_summary(&result_asset_id).await?,
            );
        }

        Ok(detail)
    }

    pub async fn save_record(
        &self,
        payload: SaveCroquisRecordPayload,
    ) -> Result<CroquisRecordDetail> {
        let record_id = self.record_repository.save(payload).await?;
        self.get_record(&record_id).await
    }

    pub async fn delete_record(
        &self,
        payload: DeleteCroquisRecordPayload,
    ) -> Result<()> {
        self.record_repository.delete(payload).await
    }

    pub async fn delete_records_by_session(
        &self,
        session_id: &str,
    ) -> Result<()> {
        self.record_repository.delete_by_session(session_id).await
    }

    pub async fn update_record_tags(
        &self,
        payload: UpdateCroquisRecordTagsPayload,
    ) -> Result<CroquisRecordDetail> {
        let record_id = payload.record_id.clone();
        self.record_repository.update_tags(payload).await?;
        self.get_record(&record_id).await
    }

    pub async fn mark_record_started(
        &self,
        record_id: &str,
    ) -> Result<CroquisRecordDetail> {
        self.record_repository.mark_started(record_id).await?;
        self.get_record(record_id).await
    }

    pub async fn finalize_record(
        &self,
        payload: FinalizeCroquisRecordPayload,
    ) -> Result<CroquisRecordDetail> {
        let record_id = payload.record_id.clone();
        self.record_repository.finalize(payload).await?;
        self.get_record(&record_id).await
    }

    pub async fn attach_result_asset(
        &self,
        record_id: &str,
        result_asset_id: &str,
        _actual_duration_seconds: Option<f64>,
    ) -> Result<CroquisRecordDetail> {
        self.record_repository
            .attach_result_asset(record_id, result_asset_id)
            .await?;
        self.get_record(record_id).await
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::{
        models::record::{
            FinalizeCroquisRecordPayload, SaveCroquisRecordPayload,
        },
        repositories::{AssetRepository, RecordRepository},
        state::bootstrap::{ensure_schema, open_or_create_db, seed_defaults},
    };

    use super::RecordService;

    fn make_temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "grim-record-service-{prefix}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("failed to create temp dir");
        dir
    }

    #[tokio::test]
    async fn save_and_finalize_record_round_trip() {
        let dir = make_temp_dir("round-trip");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

        let service = RecordService::new(
            RecordRepository::new(pool.clone()),
            AssetRepository::new(pool),
        );

        let saved = service
            .save_record(SaveCroquisRecordPayload {
                id: None,
                source_asset_id: None,
                result_asset_id: None,
                session_id: None,
                step_index: None,
                step_name: Some("Warmup".to_string()),
                title: Some("Sketch".to_string()),
                note: Some("first pass".to_string()),
                target_duration_seconds: Some(180),
                tag_ids: Vec::new(),
            })
            .await
            .expect("failed to save record");
        assert_eq!(saved.note, "first pass");

        let finalized = service
            .finalize_record(FinalizeCroquisRecordPayload {
                record_id: saved.record.id.clone(),
                finished_at: None,
                finalized_at: None,
                actual_duration_seconds: Some(12.5),
            })
            .await
            .expect("failed to finalize record");

        assert!(finalized.record.finalized_at.is_some());
        assert!(finalized.record.title.contains("(12.5s)"));

        let _ = fs::remove_dir_all(dir);
    }
}

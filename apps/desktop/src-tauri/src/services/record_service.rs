use std::collections::{HashMap, HashSet};

use anyhow::Result;

use crate::{
    models::{
        asset::AssetSummary,
        record::{
            CroquisRecordDetail, CroquisRecordResultsSnapshot,
            CroquisRecordSummary, DeleteCroquisRecordPayload,
            FinishCroquisRecordPayload, SaveCroquisRecordPayload,
            UpdateCroquisRecordTagsPayload,
        },
    },
    repositories::{AssetRepository, RecordRepository},
    services::LibraryStorage,
};

#[derive(Clone)]
pub struct RecordService {
    record_repository: RecordRepository,
    asset_repository: AssetRepository,
    library_storage: LibraryStorage,
}

impl RecordService {
    pub fn new(
        record_repository: RecordRepository,
        asset_repository: AssetRepository,
        library_storage: LibraryStorage,
    ) -> Self {
        Self { record_repository, asset_repository, library_storage }
    }

    pub async fn list_recent_records(
        &self,
        limit: Option<i64>,
    ) -> Result<Vec<CroquisRecordSummary>> {
        self.record_repository.list_recent(limit).await
    }

    pub async fn list_recent_record_results(
        &self,
        limit: Option<i64>,
    ) -> Result<CroquisRecordResultsSnapshot> {
        let mut details =
            self.record_repository.list_recent_details(limit).await?;
        self.hydrate_detail_assets_batch(&mut details).await?;
        let records =
            details.iter().map(|detail| detail.record.clone()).collect();

        Ok(CroquisRecordResultsSnapshot { records, details })
    }

    pub async fn get_record(
        &self,
        record_id: &str,
    ) -> Result<CroquisRecordDetail> {
        let mut detail = self.record_repository.get_detail(record_id).await?;

        if let Some(source_asset_id) = detail.record.source_asset_id.clone() {
            detail.source_asset =
                Some(self.load_asset_summary(&source_asset_id).await?);
        }
        if let Some(result_asset_id) = detail.record.result_asset_id.clone() {
            detail.result_asset =
                Some(self.load_asset_summary(&result_asset_id).await?);
        }

        Ok(detail)
    }

    async fn load_asset_summary(&self, asset_id: &str) -> Result<AssetSummary> {
        let mut asset = self.asset_repository.get_summary(asset_id).await?;
        self.library_storage.hydrate_asset_paths(&mut asset).await;
        Ok(asset)
    }

    async fn hydrate_detail_assets_batch(
        &self,
        details: &mut [CroquisRecordDetail],
    ) -> Result<()> {
        let mut asset_ids = Vec::new();
        let mut seen_asset_ids = HashSet::new();

        for detail in details.iter() {
            for asset_id in [
                detail.record.source_asset_id.as_deref(),
                detail.record.result_asset_id.as_deref(),
            ]
            .into_iter()
            .flatten()
            {
                if seen_asset_ids.insert(asset_id.to_string()) {
                    asset_ids.push(asset_id.to_string());
                }
            }
        }

        if asset_ids.is_empty() {
            return Ok(());
        }

        let assets =
            self.asset_repository.load_existing_summaries(&asset_ids).await?;
        let mut assets_by_id = HashMap::with_capacity(assets.len());
        for mut asset in assets {
            self.library_storage.hydrate_asset_paths(&mut asset).await;
            assets_by_id.insert(asset.id.clone(), asset);
        }

        for detail in details {
            if let Some(source_asset_id) =
                detail.record.source_asset_id.as_deref()
            {
                detail.source_asset =
                    assets_by_id.get(source_asset_id).cloned();
            }
            if let Some(result_asset_id) =
                detail.record.result_asset_id.as_deref()
            {
                detail.result_asset =
                    assets_by_id.get(result_asset_id).cloned();
            }
        }

        Ok(())
    }

    pub async fn save_record(
        &self,
        payload: SaveCroquisRecordPayload,
    ) -> Result<CroquisRecordDetail> {
        let record_id = self.record_repository.save(payload).await?;
        self.get_record(&record_id).await
    }

    pub async fn finish_record(
        &self,
        payload: FinishCroquisRecordPayload,
    ) -> Result<CroquisRecordDetail> {
        let record_id = self.record_repository.finish(payload).await?;
        self.get_record(&record_id).await
    }

    pub async fn delete_record(
        &self,
        payload: DeleteCroquisRecordPayload,
    ) -> Result<()> {
        self.record_repository.delete(payload).await
    }

    pub async fn update_record_tags(
        &self,
        payload: UpdateCroquisRecordTagsPayload,
    ) -> Result<CroquisRecordDetail> {
        let record_id = payload.record_id.clone();
        self.record_repository.update_tags(payload).await?;
        self.get_record(&record_id).await
    }

    pub async fn attach_result_asset(
        &self,
        record_id: &str,
        result_asset_id: &str,
        actual_duration_seconds: Option<f64>,
    ) -> Result<CroquisRecordDetail> {
        self.record_repository
            .attach_result_asset(
                record_id,
                result_asset_id,
                actual_duration_seconds,
            )
            .await?;
        self.get_record(record_id).await
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::{
        models::record::{
            FinishCroquisRecordPayload, SaveCroquisRecordPayload,
            UpdateCroquisRecordTagsPayload,
        },
        repositories::{
            AssetRepository, NewImportedAssetInput, RecordRepository,
            IMPORTED_ASSET_SOURCE,
        },
        services::LibraryStorage,
        state::{
            bootstrap::{ensure_schema, open_or_create_db},
            LibraryPaths,
        },
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

    fn storage_for(dir: &Path) -> LibraryStorage {
        LibraryStorage::new(LibraryPaths {
            asset_dir: dir.join("assets"),
            thumb_dir: dir.join("thumbs"),
            tmp_dir: dir.join("tmp"),
        })
    }

    const BMP_1X1: &[u8] = &[
        66, 77, 58, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0, 1, 0, 0, 0,
        1, 0, 0, 0, 1, 0, 24, 0, 0, 0, 0, 0, 4, 0, 0, 0, 19, 11, 0, 0, 19, 11,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0,
    ];

    #[tokio::test]
    async fn finish_record_round_trip() {
        let dir = make_temp_dir("round-trip");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");

        let asset_id = "asset-finish-1";
        let asset_repository = AssetRepository::new(pool.clone());
        let mut tx =
            asset_repository.begin().await.expect("failed to begin tx");
        asset_repository
            .insert_imported_in_tx(
                &mut tx,
                &NewImportedAssetInput {
                    id: asset_id,
                    hash: "finishrecordhash1",
                    file_name: "source.bmp",
                    file_size: BMP_1X1.len() as i64,
                    mime_type: "image/bmp",
                    width: 1,
                    height: 1,
                    modified_at: None,
                    source_type: IMPORTED_ASSET_SOURCE,
                    created_at: "2026-01-01T00:00:00Z",
                },
            )
            .await
            .expect("failed to insert asset");
        tx.commit().await.expect("failed to commit asset");

        let now = "2026-01-01T00:00:00Z";
        sqlx::query!(
            r#"
            INSERT INTO tag_group (id, name, sort_order, created_at, updated_at)
            VALUES ('group-finish', 'Finish', 0, ?1, ?1)
            "#,
            now
        )
        .execute(&pool)
        .await
        .expect("failed to insert tag group");
        sqlx::query!(
            r#"
            INSERT INTO tag (id, group_id, name, color, sort_order, created_at, updated_at)
            VALUES ('tag-finish', 'group-finish', 'Timed', '#ff0000', 0, ?1, ?1)
            "#,
            now
        )
        .execute(&pool)
        .await
        .expect("failed to insert tag");

        let service = RecordService::new(
            RecordRepository::new(pool),
            asset_repository,
            storage_for(&dir),
        );

        let finished = service
            .finish_record(FinishCroquisRecordPayload {
                source_asset_id: asset_id.to_string(),
                title: "Sketch".to_string(),
                target_duration_seconds: Some(180),
                actual_duration_seconds: 12.5,
                finished_at: "2026-01-01T00:00:12Z".to_string(),
                tag_ids: vec!["tag-finish".to_string()],
            })
            .await
            .expect("failed to finish record");

        assert_eq!(finished.record.title, "Sketch");
        assert_eq!(finished.record.source_asset_id.as_deref(), Some(asset_id));
        assert_eq!(
            finished.record.finished_at.as_deref(),
            Some("2026-01-01T00:00:12Z")
        );
        assert_eq!(finished.record.actual_duration_seconds, Some(12.5));
        assert_eq!(finished.tags.len(), 1);
        assert_eq!(finished.tags[0].id, "tag-finish");

        let _unfinished = service
            .save_record(SaveCroquisRecordPayload {
                source_asset_id: Some(asset_id.to_string()),
                title: Some("Unfinished legacy".to_string()),
                ..Default::default()
            })
            .await
            .expect("failed to save unfinished record");
        let recent = service
            .list_recent_records(Some(24))
            .await
            .expect("failed to list recent records");
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].id, finished.record.id);

        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn update_record_tags_adds_and_removes_persisted_tags() {
        let dir = make_temp_dir("tag-update");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");

        let now = "2026-01-01T00:00:00Z";
        sqlx::query!(
            r#"
            INSERT INTO tag_group (id, name, sort_order, created_at, updated_at)
            VALUES ('group-finish', 'Finish', 0, ?1, ?1)
            "#,
            now
        )
        .execute(&pool)
        .await
        .expect("failed to insert tag group");
        sqlx::query!(
            r#"
            INSERT INTO tag (id, group_id, name, color, sort_order, created_at, updated_at)
            VALUES ('tag-finish', 'group-finish', 'Timed', '#ff0000', 0, ?1, ?1)
            "#,
            now
        )
        .execute(&pool)
        .await
        .expect("failed to insert tag");

        let service = RecordService::new(
            RecordRepository::new(pool.clone()),
            AssetRepository::new(pool),
            storage_for(&dir),
        );
        let saved = service
            .save_record(SaveCroquisRecordPayload {
                title: Some("Tagged record".to_string()),
                ..Default::default()
            })
            .await
            .expect("failed to save record");
        assert!(saved.tags.is_empty());

        let updated = service
            .update_record_tags(UpdateCroquisRecordTagsPayload {
                record_id: saved.record.id.clone(),
                tag_ids: vec!["tag-finish".to_string()],
            })
            .await
            .expect("failed to add record tag");
        assert_eq!(updated.tags.len(), 1);
        assert_eq!(updated.tags[0].id, "tag-finish");

        let reloaded = service
            .get_record(&saved.record.id)
            .await
            .expect("failed to reload tagged record");
        assert_eq!(reloaded.tags.len(), 1);
        assert_eq!(reloaded.tags[0].id, "tag-finish");

        let removed = service
            .update_record_tags(UpdateCroquisRecordTagsPayload {
                record_id: saved.record.id.clone(),
                tag_ids: Vec::new(),
            })
            .await
            .expect("failed to remove record tags");
        assert!(removed.tags.is_empty());

        let reloaded = service
            .get_record(&saved.record.id)
            .await
            .expect("failed to reload untagged record");
        assert!(reloaded.tags.is_empty());

        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn record_detail_hydrates_related_asset_paths() {
        let dir = make_temp_dir("asset-hydration");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");

        let storage = storage_for(&dir);
        let asset_id = "asset-1";
        let hash = "recordassetpath1";
        let file_name = "asset.bmp";
        let asset_path = storage.asset_path(hash, file_name);
        let thumb_path = storage.thumbnail_path(hash);
        fs::create_dir_all(asset_path.parent().expect("missing asset parent"))
            .expect("failed to create asset parent");
        fs::create_dir_all(thumb_path.parent().expect("missing thumb parent"))
            .expect("failed to create thumb parent");
        fs::write(&asset_path, BMP_1X1).expect("failed to write asset");
        fs::write(&thumb_path, BMP_1X1).expect("failed to write thumbnail");

        let asset_repository = AssetRepository::new(pool.clone());
        let mut tx =
            asset_repository.begin().await.expect("failed to begin tx");
        asset_repository
            .insert_imported_in_tx(
                &mut tx,
                &NewImportedAssetInput {
                    id: asset_id,
                    hash,
                    file_name,
                    file_size: BMP_1X1.len() as i64,
                    mime_type: "image/bmp",
                    width: 1,
                    height: 1,
                    modified_at: None,
                    source_type: IMPORTED_ASSET_SOURCE,
                    created_at: "2026-01-01T00:00:00Z",
                },
            )
            .await
            .expect("failed to insert asset");
        tx.commit().await.expect("failed to commit asset");

        let service = RecordService::new(
            RecordRepository::new(pool),
            asset_repository,
            storage,
        );
        let saved = service
            .finish_record(FinishCroquisRecordPayload {
                source_asset_id: asset_id.to_string(),
                title: "Sketch".to_string(),
                target_duration_seconds: Some(120),
                actual_duration_seconds: 30.0,
                finished_at: "2026-01-01T00:00:30Z".to_string(),
                tag_ids: Vec::new(),
            })
            .await
            .expect("failed to save record");
        let source_asset = saved.source_asset.expect("missing source asset");
        assert_eq!(
            source_asset.storage_path.as_deref(),
            Some(asset_path.to_string_lossy().as_ref())
        );
        assert_eq!(
            source_asset.thumbnail_path.as_deref(),
            Some(thumb_path.to_string_lossy().as_ref())
        );

        let _ = fs::remove_dir_all(dir);
    }
}

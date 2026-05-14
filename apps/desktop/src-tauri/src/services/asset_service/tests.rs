use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};

use crate::{
    models::{
        asset::{
            AssetListSource, BatchUpdateAssetFoldersMode,
            BatchUpdateAssetFoldersPayload, ImportRemoteImagesRequest,
            ImportRequest, UpdateAssetFoldersPayload,
        },
        folder::{
            DeleteVirtualFolderPayload, SaveVirtualFolderPayload,
            VirtualFolderKind,
        },
        record::{FinishCroquisRecordPayload, SaveCroquisRecordPayload},
    },
    repositories::{
        AssetRepository, FolderRepository, NewImportedAssetInput,
        RecordRepository, IMPORTED_ASSET_SOURCE,
    },
    services::{AssetService, FolderService, LibraryStorage},
    state::{
        bootstrap::{ensure_schema, open_or_create_db},
        LibraryPaths,
    },
    utils::media,
};

const BMP_1X1: &[u8] = &[
    66, 77, 58, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0, 1, 0, 0, 0, 1,
    0, 0, 0, 1, 0, 24, 0, 0, 0, 0, 0, 4, 0, 0, 0, 19, 11, 0, 0, 19, 11, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0,
];

fn make_temp_dir(prefix: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock should be after unix epoch")
        .as_nanos();
    let dir = std::env::temp_dir().join(format!(
        "grim-asset-service-{prefix}-{}-{nanos}",
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

fn path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

async fn insert_test_asset(
    asset_repository: &AssetRepository,
    id: &str,
    hash: &str,
    file_name: &str,
) {
    let mut tx = asset_repository
        .begin()
        .await
        .expect("failed to begin asset insert tx");
    asset_repository
        .insert_imported_in_tx(
            &mut tx,
            &NewImportedAssetInput {
                id,
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
    tx.commit().await.expect("failed to commit asset insert");
}

#[tokio::test]
async fn asset_reads_hydrate_storage_and_thumbnail_paths() {
    let dir = make_temp_dir("hydrate-paths");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let source_path = dir.join("source.bmp");
    fs::write(&source_path, BMP_1X1).expect("failed to write test image");

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool),
        storage_for(&dir),
    );
    let result = service
        .import_images(ImportRequest {
            file_paths: vec![path_string(&source_path)],
            virtual_folder_ids: Vec::new(),
        })
        .await
        .expect("failed to import asset");
    let imported = result.assets.first().expect("missing imported asset");
    assert!(imported.storage_path.is_some());
    assert!(imported.thumbnail_path.is_some());

    let listed = service
        .list_assets(AssetListSource::AllAssets)
        .await
        .expect("failed to list assets");
    let listed_asset = listed.first().expect("missing listed asset");
    assert_eq!(listed_asset.id, imported.id);
    assert!(listed_asset.storage_path.is_some());
    assert!(listed_asset.thumbnail_path.is_some());

    let detail = service.get_asset(&imported.id).await.expect("missing detail");
    assert!(detail.asset.storage_path.is_some());
    assert!(detail.asset.thumbnail_path.is_some());
    assert_eq!(detail.last_croquis_at, None);

    let loaded = service
        .load_assets_by_ids(std::slice::from_ref(&imported.id))
        .await
        .expect("failed to load assets by id");
    let loaded_asset = loaded.first().expect("missing loaded asset");
    assert!(loaded_asset.storage_path.is_some());
    assert!(loaded_asset.thumbnail_path.is_some());

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn import_images_keeps_successful_files_when_one_fails() {
    let dir = make_temp_dir("partial-import");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let source_path = dir.join("source.bmp");
    let missing_path = dir.join("missing.bmp");
    fs::write(&source_path, BMP_1X1).expect("failed to write test image");

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool),
        storage_for(&dir),
    );
    let result = service
        .import_images(ImportRequest {
            file_paths: vec![
                path_string(&source_path),
                path_string(&missing_path),
            ],
            virtual_folder_ids: Vec::new(),
        })
        .await
        .expect("partial import should not fail the whole request");

    assert_eq!(result.imported, 1);
    assert_eq!(result.reused, 0);
    assert_eq!(result.assets.len(), 1);
    assert_eq!(result.failed.len(), 1);
    assert_eq!(result.failed[0].file_path, path_string(&missing_path));
    assert!(result.failed[0].error.contains("Failed to read metadata"));

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn capture_result_assets_stay_hidden_after_record_delete() {
    let dir = make_temp_dir("capture-result-hidden-delete");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool.clone()),
        storage_for(&dir),
    );
    let source_path = dir.join("source.bmp");
    fs::write(&source_path, BMP_1X1).expect("failed to write test image");
    let import_result = service
        .import_images(ImportRequest {
            file_paths: vec![path_string(&source_path)],
            virtual_folder_ids: Vec::new(),
        })
        .await
        .expect("failed to import source asset");
    let source_asset_id =
        import_result.assets.first().expect("missing source asset").id.clone();

    let record_repository = RecordRepository::new(pool);
    let record_id = record_repository
        .finish(FinishCroquisRecordPayload {
            source_asset_id,
            title: "Capture source".to_string(),
            target_duration_seconds: None,
            actual_duration_seconds: 1.0,
            finished_at: "2030-01-05T00:00:00Z".to_string(),
            tag_ids: Vec::new(),
        })
        .await
        .expect("failed to finish record");

    let mut capture_bytes = BMP_1X1.to_vec();
    capture_bytes[54] = 0;
    capture_bytes[55] = 255;
    let capture_asset = service
        .import_capture_result(&capture_bytes, "capture.bmp")
        .await
        .expect("failed to import capture result");
    record_repository
        .attach_result_asset(&record_id, &capture_asset.id, None)
        .await
        .expect("failed to attach capture result");

    let listed_before_delete = service
        .list_assets(AssetListSource::AllAssets)
        .await
        .expect("failed to list assets");
    assert!(!listed_before_delete
        .iter()
        .any(|asset| asset.id == capture_asset.id));

    record_repository
        .delete(crate::models::record::DeleteCroquisRecordPayload { record_id })
        .await
        .expect("failed to delete record");

    let listed_after_delete = service
        .list_assets(AssetListSource::AllAssets)
        .await
        .expect("failed to list assets after delete");
    assert!(!listed_after_delete
        .iter()
        .any(|asset| asset.id == capture_asset.id));

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn manual_import_promotes_matching_capture_result_asset() {
    let dir = make_temp_dir("capture-result-promote");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool),
        storage_for(&dir),
    );
    let capture_asset = service
        .import_capture_result(BMP_1X1, "capture.bmp")
        .await
        .expect("failed to import capture result");
    let hidden_assets = service
        .list_assets(AssetListSource::AllAssets)
        .await
        .expect("failed to list hidden capture result");
    assert!(hidden_assets.is_empty());

    let source_path = dir.join("source.bmp");
    fs::write(&source_path, BMP_1X1).expect("failed to write test image");
    let import_result = service
        .import_images(ImportRequest {
            file_paths: vec![path_string(&source_path)],
            virtual_folder_ids: Vec::new(),
        })
        .await
        .expect("failed to import matching asset");
    assert_eq!(import_result.imported, 0);
    assert_eq!(import_result.reused, 1);

    let listed_assets = service
        .list_assets(AssetListSource::AllAssets)
        .await
        .expect("failed to list promoted asset");
    assert_eq!(listed_assets.len(), 1);
    assert_eq!(listed_assets[0].id, capture_asset.id);

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn preview_import_images_keeps_supported_files_when_one_path_fails() {
    let dir = make_temp_dir("partial-preview");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let source_path = dir.join("source.bmp");
    let missing_path = dir.join("missing.bmp");
    fs::write(&source_path, BMP_1X1).expect("failed to write test image");

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool),
        storage_for(&dir),
    );
    let result = service
        .preview_import_images(ImportRequest {
            file_paths: vec![
                path_string(&source_path),
                path_string(&missing_path),
            ],
            virtual_folder_ids: Vec::new(),
        })
        .await
        .expect("partial preview should not fail the whole request");

    assert_eq!(result.asset_count, 1);
    assert_eq!(result.file_paths, vec![path_string(&source_path)]);
    assert_eq!(result.total_size, BMP_1X1.len() as i64);
    assert_eq!(result.failed.len(), 1);
    assert_eq!(result.failed[0].file_path, path_string(&missing_path));
    assert!(result.failed[0].error.contains("Failed to read metadata"));

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn asset_detail_reports_last_croquis_at_from_related_records() {
    let dir = make_temp_dir("last-croquis");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool.clone()),
        storage_for(&dir),
    );
    let source_path = dir.join("source.bmp");
    fs::write(&source_path, BMP_1X1).expect("failed to write test image");
    let result = service
        .import_images(ImportRequest {
            file_paths: vec![path_string(&source_path)],
            virtual_folder_ids: Vec::new(),
        })
        .await
        .expect("failed to import asset");
    let asset_id =
        result.assets.first().expect("missing imported asset").id.clone();

    let asset_repository = AssetRepository::new(pool.clone());
    let record_repository = RecordRepository::new(pool);
    let _created_record_id = record_repository
        .save(SaveCroquisRecordPayload {
            source_asset_id: Some(asset_id.clone()),
            title: Some("Created only".to_string()),
            ..Default::default()
        })
        .await
        .expect("failed to save created record");

    record_repository
        .finish(FinishCroquisRecordPayload {
            source_asset_id: asset_id.clone(),
            title: "Finished".to_string(),
            target_duration_seconds: Some(180),
            actual_duration_seconds: 180.0,
            finished_at: "2030-01-05T00:00:00Z".to_string(),
            tag_ids: Vec::new(),
        })
        .await
        .expect("failed to finish record");

    record_repository
        .finish(FinishCroquisRecordPayload {
            source_asset_id: asset_id.clone(),
            title: "Later related".to_string(),
            target_duration_seconds: None,
            actual_duration_seconds: 1.0,
            finished_at: "2031-01-01T00:00:00Z".to_string(),
            tag_ids: Vec::new(),
        })
        .await
        .expect("failed to finish later related record");

    let unrelated_asset_id = "asset-unrelated";
    let mut tx = asset_repository
        .begin()
        .await
        .expect("failed to begin unrelated asset tx");
    asset_repository
        .insert_imported_in_tx(
            &mut tx,
            &NewImportedAssetInput {
                id: unrelated_asset_id,
                hash: "unrelatedassethash",
                file_name: "unrelated.bmp",
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
        .expect("failed to insert unrelated asset");
    tx.commit().await.expect("failed to commit unrelated asset");
    record_repository
        .finish(FinishCroquisRecordPayload {
            source_asset_id: unrelated_asset_id.to_string(),
            title: "Unrelated".to_string(),
            target_duration_seconds: None,
            actual_duration_seconds: 1.0,
            finished_at: "2099-01-01T00:00:00Z".to_string(),
            tag_ids: Vec::new(),
        })
        .await
        .expect("failed to finish unrelated record");

    let detail = service.get_asset(&asset_id).await.expect("missing asset");
    assert_eq!(detail.last_croquis_at.as_deref(), Some("2031-01-01T00:00:00Z"));
    assert_eq!(detail.related_records.len(), 2);
    assert!(detail
        .related_records
        .iter()
        .all(|record| record.finished_at.is_some()));

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn missing_thumbnail_path_is_none_without_failing_read() {
    let dir = make_temp_dir("missing-thumb");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool),
        storage_for(&dir),
    );
    let source_path = dir.join("source.bmp");
    fs::write(&source_path, BMP_1X1).expect("failed to write test image");
    let result = service
        .import_images(ImportRequest {
            file_paths: vec![path_string(&source_path)],
            virtual_folder_ids: Vec::new(),
        })
        .await
        .expect("failed to import asset");
    let imported = result.assets.first().expect("missing imported asset");
    let asset_id = imported.id.clone();
    let expected_asset_path =
        imported.storage_path.clone().expect("missing hydrated storage path");
    let thumbnail_path = imported
        .thumbnail_path
        .clone()
        .expect("missing hydrated thumbnail path");
    fs::remove_file(thumbnail_path).expect("failed to remove thumbnail");

    let detail = service.get_asset(&asset_id).await.expect("missing asset");
    assert_eq!(
        detail.asset.storage_path.as_deref(),
        Some(expected_asset_path.as_str())
    );
    assert_eq!(detail.asset.thumbnail_path, None);

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn folder_assignment_requires_leaf_folder() {
    let dir = make_temp_dir("leaf-assignment");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let folder_service =
        FolderService::new(FolderRepository::new(pool.clone()));
    let parent = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "Anatomy".to_string(),
            parent_id: None,
            alias: None,
        })
        .await
        .expect("failed to save parent folder");
    let child = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "Musculature".to_string(),
            parent_id: Some(parent.saved_folder_id.clone()),
            alias: None,
        })
        .await
        .expect("failed to save child folder");

    let asset_id = "asset-1";
    sqlx::query!(
            r#"
            INSERT INTO asset
            (id, hash, file_name, file_size, mime_type, width, height, modified_at, created_at, updated_at)
            VALUES (?1, 'hash-1', 'asset.png', 1, 'image/png', 1, 1, NULL, 'now', 'now')
            "#,
            asset_id
        )
        .execute(&pool)
        .await
        .expect("failed to insert asset");

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool),
        storage_for(&dir),
    );

    let parent_result = service
        .update_asset_folders(UpdateAssetFoldersPayload {
            asset_id: asset_id.to_string(),
            virtual_folder_ids: vec![parent.saved_folder_id],
        })
        .await;
    assert!(parent_result.is_err());

    let child_result = service
        .update_asset_folders(UpdateAssetFoldersPayload {
            asset_id: asset_id.to_string(),
            virtual_folder_ids: vec![child.saved_folder_id],
        })
        .await;
    assert!(child_result.is_ok());

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn batch_update_asset_folders_appends_target_folder_to_assets() {
    let dir = make_temp_dir("batch-append-folders");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let folder_service =
        FolderService::new(FolderRepository::new(pool.clone()));
    let initial = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "Initial".to_string(),
            parent_id: None,
            alias: None,
        })
        .await
        .expect("failed to save initial folder");
    let target = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "Target".to_string(),
            parent_id: None,
            alias: None,
        })
        .await
        .expect("failed to save target folder");

    let asset_repository = AssetRepository::new(pool.clone());
    insert_test_asset(
        &asset_repository,
        "asset-1",
        "hash-batch-append-1",
        "asset-1.bmp",
    )
    .await;
    insert_test_asset(
        &asset_repository,
        "asset-2",
        "hash-batch-append-2",
        "asset-2.bmp",
    )
    .await;

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool),
        storage_for(&dir),
    );
    service
        .update_asset_folders(UpdateAssetFoldersPayload {
            asset_id: "asset-1".to_string(),
            virtual_folder_ids: vec![initial.saved_folder_id.clone()],
        })
        .await
        .expect("failed to assign initial folder");

    let details = service
        .batch_update_asset_folders(BatchUpdateAssetFoldersPayload {
            asset_ids: vec!["asset-1".to_string(), "asset-2".to_string()],
            virtual_folder_ids: vec![target.saved_folder_id.clone()],
            mode: BatchUpdateAssetFoldersMode::Append,
        })
        .await
        .expect("failed to batch append folders");

    assert_eq!(details.len(), 2);
    let asset_one = details
        .iter()
        .find(|detail| detail.asset.id == "asset-1")
        .expect("missing first asset detail");
    assert!(asset_one
        .virtual_folders
        .iter()
        .any(|folder| folder.id == initial.saved_folder_id));
    assert!(asset_one
        .virtual_folders
        .iter()
        .any(|folder| folder.id == target.saved_folder_id));
    let asset_two = details
        .iter()
        .find(|detail| detail.asset.id == "asset-2")
        .expect("missing second asset detail");
    assert_eq!(asset_two.virtual_folders.len(), 1);
    assert_eq!(asset_two.virtual_folders[0].id, target.saved_folder_id);

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn batch_update_asset_folders_replaces_target_folders() {
    let dir = make_temp_dir("batch-replace-folders");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let folder_service =
        FolderService::new(FolderRepository::new(pool.clone()));
    let old_folder = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "Old".to_string(),
            parent_id: None,
            alias: None,
        })
        .await
        .expect("failed to save old folder");
    let replacement = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "Replacement".to_string(),
            parent_id: None,
            alias: None,
        })
        .await
        .expect("failed to save replacement folder");

    let asset_repository = AssetRepository::new(pool.clone());
    insert_test_asset(
        &asset_repository,
        "asset-1",
        "hash-batch-replace-1",
        "asset-1.bmp",
    )
    .await;
    insert_test_asset(
        &asset_repository,
        "asset-2",
        "hash-batch-replace-2",
        "asset-2.bmp",
    )
    .await;

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool),
        storage_for(&dir),
    );
    for asset_id in ["asset-1", "asset-2"] {
        service
            .update_asset_folders(UpdateAssetFoldersPayload {
                asset_id: asset_id.to_string(),
                virtual_folder_ids: vec![old_folder.saved_folder_id.clone()],
            })
            .await
            .expect("failed to assign old folder");
    }

    let details = service
        .batch_update_asset_folders(BatchUpdateAssetFoldersPayload {
            asset_ids: vec!["asset-1".to_string(), "asset-2".to_string()],
            virtual_folder_ids: vec![replacement.saved_folder_id.clone()],
            mode: BatchUpdateAssetFoldersMode::Replace,
        })
        .await
        .expect("failed to batch replace folders");

    assert_eq!(details.len(), 2);
    for detail in details {
        assert_eq!(detail.virtual_folders.len(), 1);
        assert_eq!(detail.virtual_folders[0].id, replacement.saved_folder_id);
    }

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn batch_update_asset_folders_rejects_missing_asset_before_mutating() {
    let dir = make_temp_dir("batch-missing-asset");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let folder_service =
        FolderService::new(FolderRepository::new(pool.clone()));
    let old_folder = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "Old".to_string(),
            parent_id: None,
            alias: None,
        })
        .await
        .expect("failed to save old folder");

    let asset_repository = AssetRepository::new(pool.clone());
    insert_test_asset(
        &asset_repository,
        "asset-1",
        "hash-batch-missing-1",
        "asset-1.bmp",
    )
    .await;

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool),
        storage_for(&dir),
    );
    service
        .update_asset_folders(UpdateAssetFoldersPayload {
            asset_id: "asset-1".to_string(),
            virtual_folder_ids: vec![old_folder.saved_folder_id.clone()],
        })
        .await
        .expect("failed to assign old folder");

    let result = service
        .batch_update_asset_folders(BatchUpdateAssetFoldersPayload {
            asset_ids: vec!["asset-1".to_string(), "missing-asset".to_string()],
            virtual_folder_ids: Vec::new(),
            mode: BatchUpdateAssetFoldersMode::Replace,
        })
        .await;

    assert!(result.is_err());
    let detail = service.get_asset("asset-1").await.expect("missing asset");
    assert_eq!(detail.virtual_folders.len(), 1);
    assert_eq!(detail.virtual_folders[0].id, old_folder.saved_folder_id);

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn moving_last_asset_out_of_system_uncategorized_cleans_up_folder() {
    let dir = make_temp_dir("cleanup-system-child");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let folder_service =
        FolderService::new(FolderRepository::new(pool.clone()));
    let parent = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "Anatomy".to_string(),
            parent_id: None,
            alias: None,
        })
        .await
        .expect("failed to save parent folder");

    let asset_id = "asset-1";
    sqlx::query!(
            r#"
            INSERT INTO asset
            (id, hash, file_name, file_size, mime_type, width, height, modified_at, created_at, updated_at)
            VALUES (?1, 'hash-1', 'asset.png', 1, 'image/png', 1, 1, NULL, 'now', 'now')
            "#,
            asset_id
        )
        .execute(&pool)
        .await
        .expect("failed to insert asset");
    let parent_folder_id = parent.saved_folder_id.as_str();
    sqlx::query!(
        r#"
            INSERT INTO asset_virtual_folder
            (asset_id, virtual_folder_id, source_type, created_at)
            VALUES (?1, ?2, 'manual', 'now')
            "#,
        asset_id,
        parent_folder_id
    )
    .execute(&pool)
    .await
    .expect("failed to assign asset to parent");

    let child = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "Musculature".to_string(),
            parent_id: Some(parent.saved_folder_id.clone()),
            alias: None,
        })
        .await
        .expect("failed to save child folder");
    folder_service
        .delete_virtual_folder(DeleteVirtualFolderPayload {
            folder_id: child.saved_folder_id,
        })
        .await
        .expect("failed to delete child folder");

    let target = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "References".to_string(),
            parent_id: None,
            alias: None,
        })
        .await
        .expect("failed to save target folder");
    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool.clone()),
        storage_for(&dir),
    );
    service
        .update_asset_folders(UpdateAssetFoldersPayload {
            asset_id: asset_id.to_string(),
            virtual_folder_ids: vec![target.saved_folder_id],
        })
        .await
        .expect("failed to move asset out of system folder");

    let folders = folder_service
        .load_virtual_folders()
        .await
        .expect("failed to reload folders");
    assert!(!folders.iter().any(|folder| {
        folder.parent_id.as_deref() == Some(parent.saved_folder_id.as_str())
            && folder.kind == VirtualFolderKind::SystemUncategorized
    }));

    folder_service
        .delete_virtual_folder(DeleteVirtualFolderPayload {
            folder_id: parent.saved_folder_id,
        })
        .await
        .expect("failed to delete reverted leaf parent");

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn existing_asset_import_reuse_validates_target_in_assignment_tx() {
    let dir = make_temp_dir("reuse-import-assignment");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let source_path = dir.join("source.bmp");
    fs::write(&source_path, BMP_1X1).expect("failed to write test image");
    let hash = media::hash_file(&source_path)
        .await
        .expect("failed to hash test image");
    let asset_id = "asset-1";
    sqlx::query!(
            r#"
            INSERT INTO asset
            (id, hash, file_name, file_size, mime_type, width, height, modified_at, created_at, updated_at)
            VALUES (?1, ?2, 'source.bmp', 1, 'image/bmp', 1, 1, NULL, 'now', 'now')
            "#,
            asset_id,
            hash
        )
        .execute(&pool)
        .await
        .expect("failed to insert existing asset");

    let folder_service =
        FolderService::new(FolderRepository::new(pool.clone()));
    let parent = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "Anatomy".to_string(),
            parent_id: None,
            alias: None,
        })
        .await
        .expect("failed to save parent folder");
    let child = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "Musculature".to_string(),
            parent_id: Some(parent.saved_folder_id.clone()),
            alias: None,
        })
        .await
        .expect("failed to save child folder");

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool.clone()),
        storage_for(&dir),
    );
    let parent_result = service
        .import_images(ImportRequest {
            file_paths: vec![path_string(&source_path)],
            virtual_folder_ids: vec![parent.saved_folder_id],
        })
        .await;
    assert!(parent_result.is_err());

    let child_result = service
        .import_images(ImportRequest {
            file_paths: vec![path_string(&source_path)],
            virtual_folder_ids: vec![child.saved_folder_id.clone()],
        })
        .await
        .expect("failed to reuse existing asset");
    assert_eq!(child_result.imported, 0);
    assert_eq!(child_result.reused, 1);

    let detail = service.get_asset(asset_id).await.expect("missing asset");
    assert!(detail
        .virtual_folders
        .iter()
        .any(|folder| folder.id == child.saved_folder_id));

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn new_import_assigns_leaf_folder_through_assignment_helper() {
    let dir = make_temp_dir("new-import-assignment");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let source_path = dir.join("source.bmp");
    fs::write(&source_path, BMP_1X1).expect("failed to write test image");

    let folder_service =
        FolderService::new(FolderRepository::new(pool.clone()));
    let leaf = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "References".to_string(),
            parent_id: None,
            alias: None,
        })
        .await
        .expect("failed to save leaf folder");

    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool),
        storage_for(&dir),
    );
    let result = service
        .import_images(ImportRequest {
            file_paths: vec![path_string(&source_path)],
            virtual_folder_ids: vec![leaf.saved_folder_id.clone()],
        })
        .await
        .expect("failed to import new asset");

    assert_eq!(result.imported, 1);
    assert_eq!(result.reused, 0);
    let asset = result.assets.first().expect("missing imported asset");
    let detail =
        service.get_asset(&asset.id).await.expect("missing asset detail");
    assert!(detail
        .virtual_folders
        .iter()
        .any(|folder| folder.id == leaf.saved_folder_id));

    let _ = fs::remove_dir_all(dir);
}

#[tokio::test]
async fn remote_image_import_accepts_dragged_data_src_and_assigns_folder() {
    let dir = make_temp_dir("remote-import");
    let db_path = dir.join("grim.db");
    let pool = open_or_create_db(&db_path).await.expect("failed to open db");
    ensure_schema(&pool).await.expect("failed to apply schema");

    let folder_service =
        FolderService::new(FolderRepository::new(pool.clone()));
    let leaf = folder_service
        .save_virtual_folder(SaveVirtualFolderPayload {
            id: None,
            name: "Web References".to_string(),
            parent_id: None,
            alias: None,
        })
        .await
        .expect("failed to save leaf folder");

    let data_url =
        format!("data:image/bmp;base64,{}", BASE64_STANDARD.encode(BMP_1X1));
    let service = AssetService::new(
        AssetRepository::new(pool.clone()),
        FolderRepository::new(pool),
        storage_for(&dir),
    );
    let result = service
            .import_remote_images(ImportRemoteImagesRequest {
                sources: vec![format!(
                    r#"<a href="https://example.test/page"><img src="{data_url}" /></a>"#
                )],
                virtual_folder_ids: vec![leaf.saved_folder_id.clone()],
            })
            .await
            .expect("failed to import remote image");

    assert_eq!(result.imported, 1);
    assert_eq!(result.reused, 0);
    let asset = result.assets.first().expect("missing imported asset");
    assert_eq!(asset.file_name, "remote-image.bmp");
    assert!(asset.storage_path.is_some());
    assert!(asset.thumbnail_path.is_some());

    let detail =
        service.get_asset(&asset.id).await.expect("missing asset detail");
    assert!(detail
        .virtual_folders
        .iter()
        .any(|folder| folder.id == leaf.saved_folder_id));

    let _ = fs::remove_dir_all(dir);
}

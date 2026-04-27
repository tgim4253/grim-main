use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use sqlx::{Sqlite, Transaction};
use tokio::fs;

use crate::{
    models::asset::{
        AssetDetail, AssetListSource, AssetSummary, ImportFailure,
        ImportPreviewResult, ImportRemoteImagesRequest, ImportRequest,
        ImportResult, UpdateAssetFoldersPayload,
    },
    repositories::{
        AssetRepository, FolderRepository, NewImportedAssetInput,
        CROQUIS_RESULT_ASSET_SOURCE, IMPORTED_ASSET_SOURCE,
    },
    services::LibraryStorage,
    utils::{
        date::get_now_date, file_ops::ensure_unique_path,
        file_utils::file_mtime_epoch, identifier::get_unique_id, media,
        remote_image,
    },
};

#[derive(Clone)]
pub struct AssetService {
    asset_repository: AssetRepository,
    folder_repository: FolderRepository,
    library_storage: LibraryStorage,
}

#[derive(Clone, Copy)]
enum AssetFolderAssignmentMode {
    Replace,
    Append,
}

struct ImportPreviewScan {
    file_paths: Vec<(String, i64)>,
    failed: Vec<ImportFailure>,
}

impl AssetService {
    pub fn new(
        asset_repository: AssetRepository,
        folder_repository: FolderRepository,
        library_storage: LibraryStorage,
    ) -> Self {
        Self { asset_repository, folder_repository, library_storage }
    }

    pub async fn count_all_assets(&self) -> Result<i64> {
        self.asset_repository.count_all().await
    }

    pub async fn count_unassigned_assets(&self) -> Result<i64> {
        self.asset_repository.count_unassigned_assets().await
    }

    pub async fn list_assets(
        &self,
        source: AssetListSource,
    ) -> Result<Vec<AssetSummary>> {
        let assets = self.asset_repository.list_by_source(source).await?;
        Ok(self.hydrate_asset_summaries(assets).await)
    }

    pub async fn get_asset(&self, asset_id: &str) -> Result<AssetDetail> {
        let detail = self.asset_repository.get_detail(asset_id).await?;
        Ok(self.hydrate_asset_detail(detail).await)
    }

    pub async fn update_asset_folders(
        &self,
        payload: UpdateAssetFoldersPayload,
    ) -> Result<AssetDetail> {
        let asset_id = payload.asset_id.clone();
        self.apply_asset_folder_assignments(
            &asset_id,
            &payload.virtual_folder_ids,
            AssetFolderAssignmentMode::Replace,
        )
        .await?;
        let detail = self.asset_repository.get_detail(&asset_id).await?;
        Ok(self.hydrate_asset_detail(detail).await)
    }

    async fn apply_asset_folder_assignments(
        &self,
        asset_id: &str,
        virtual_folder_ids: &[String],
        mode: AssetFolderAssignmentMode,
    ) -> Result<()> {
        let mut tx = self.asset_repository.begin().await?;
        self.apply_asset_folder_assignments_in_tx(
            &mut tx,
            asset_id,
            virtual_folder_ids,
            mode,
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn apply_asset_folder_assignments_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        asset_id: &str,
        virtual_folder_ids: &[String],
        mode: AssetFolderAssignmentMode,
    ) -> Result<()> {
        let old_folders = self
            .asset_repository
            .load_assigned_folders_in_tx(tx, asset_id)
            .await?;
        self.folder_repository
            .validate_assignable_folders_in_tx(tx, virtual_folder_ids)
            .await?;

        match mode {
            AssetFolderAssignmentMode::Replace => {
                self.asset_repository
                    .replace_folders_in_tx(tx, asset_id, virtual_folder_ids)
                    .await?;
            }
            AssetFolderAssignmentMode::Append => {
                self.asset_repository
                    .assign_folders_in_tx(tx, asset_id, virtual_folder_ids)
                    .await?;
            }
        }

        let cleanup_folders = match mode {
            AssetFolderAssignmentMode::Replace => {
                let target_ids = virtual_folder_ids
                    .iter()
                    .map(String::as_str)
                    .collect::<HashSet<_>>();
                old_folders
                    .into_iter()
                    .filter(|folder| !target_ids.contains(folder.id.as_str()))
                    .collect::<Vec<_>>()
            }
            AssetFolderAssignmentMode::Append => Vec::new(),
        };
        self.folder_repository
            .cleanup_empty_system_uncategorized_parents_in_tx(
                tx,
                &cleanup_folders,
            )
            .await?;

        Ok(())
    }

    async fn validate_import_folders(
        &self,
        virtual_folder_ids: &[String],
    ) -> Result<()> {
        if virtual_folder_ids.is_empty() {
            return Ok(());
        }

        let mut tx = self.asset_repository.begin().await?;
        self.folder_repository
            .validate_assignable_folders_in_tx(&mut tx, virtual_folder_ids)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn reveal_path(&self, path: &Path) -> Result<()> {
        self.library_storage.reveal_path(path).await
    }

    async fn expand_import_file_paths(
        &self,
        file_paths: &[String],
    ) -> ImportPreviewScan {
        let mut seen_file_paths = HashSet::new();
        let mut expanded_file_paths = Vec::new();
        let mut failed = Vec::new();

        for file_path in file_paths {
            let file_path = file_path.trim();
            if file_path.is_empty() {
                continue;
            }

            let source = PathBuf::from(file_path);
            let metadata = match fs::symlink_metadata(&source).await {
                Ok(metadata) => metadata,
                Err(error) => {
                    failed.push(ImportFailure {
                        file_path: file_path.to_string(),
                        error: format!(
                            "Failed to read metadata for {}: {error}",
                            source.display()
                        ),
                    });
                    continue;
                }
            };
            let file_type = metadata.file_type();
            if file_type.is_symlink() {
                continue;
            }

            if metadata.is_file() {
                if media::is_supported_image(&source)
                    && seen_file_paths.insert(file_path.to_string())
                {
                    expanded_file_paths
                        .push((file_path.to_string(), metadata.len() as i64));
                }
                continue;
            }

            if !metadata.is_dir() {
                continue;
            }

            let mut pending_dirs = vec![source];
            while let Some(directory) = pending_dirs.pop() {
                let mut entries = match fs::read_dir(&directory).await {
                    Ok(entries) => entries,
                    Err(error) => {
                        failed.push(ImportFailure {
                            file_path: directory.to_string_lossy().into_owned(),
                            error: format!(
                                "Failed to read directory {}: {error}",
                                directory.display()
                            ),
                        });
                        continue;
                    }
                };

                loop {
                    let entry = match entries.next_entry().await {
                        Ok(Some(entry)) => entry,
                        Ok(None) => break,
                        Err(error) => {
                            // Reading the next entry can fail after the directory is opened.
                            failed.push(ImportFailure {
                                file_path: directory
                                    .to_string_lossy()
                                    .into_owned(),
                                error: format!(
                                    "Failed to read directory {}: {error}",
                                    directory.display()
                                ),
                            });
                            break;
                        }
                    };
                    let path = entry.path();
                    let metadata = match entry.metadata().await {
                        Ok(metadata) => metadata,
                        Err(error) => {
                            failed.push(ImportFailure {
                                file_path: path.to_string_lossy().into_owned(),
                                error: format!(
                                    "Failed to read metadata for {}: {error}",
                                    path.display()
                                ),
                            });
                            continue;
                        }
                    };
                    let file_type = metadata.file_type();
                    if file_type.is_symlink() {
                        continue;
                    }

                    if metadata.is_dir() {
                        pending_dirs.push(path);
                        continue;
                    }

                    if metadata.is_file() && media::is_supported_image(&path) {
                        let path_string = path.to_string_lossy().into_owned();
                        if seen_file_paths.insert(path_string.clone()) {
                            expanded_file_paths
                                .push((path_string, metadata.len() as i64));
                        }
                    }
                }
            }
        }

        ImportPreviewScan { file_paths: expanded_file_paths, failed }
    }

    pub async fn preview_import_images(
        &self,
        request: ImportRequest,
    ) -> Result<ImportPreviewResult> {
        let scan = self.expand_import_file_paths(&request.file_paths).await;
        let total_size =
            scan.file_paths.iter().map(|(_, file_size)| *file_size).sum();
        let file_paths = scan
            .file_paths
            .into_iter()
            .map(|(file_path, _)| file_path)
            .collect::<Vec<_>>();

        Ok(ImportPreviewResult {
            asset_count: file_paths.len(),
            total_size,
            file_paths,
            failed: scan.failed,
        })
    }

    pub async fn import_images(
        &self,
        request: ImportRequest,
    ) -> Result<ImportResult> {
        self.validate_import_folders(&request.virtual_folder_ids).await?;

        let mut imported = 0_usize;
        let mut reused = 0_usize;
        let mut failed = Vec::new();
        let mut assets = Vec::new();

        for file_path in &request.file_paths {
            match self.import_image_asset(&request, file_path).await {
                Ok(Some((asset, is_reused))) => {
                    if is_reused {
                        reused += 1;
                    } else {
                        imported += 1;
                    }
                    assets.push(asset);
                }
                Ok(None) => {}
                Err(error) => {
                    failed.push(ImportFailure {
                        file_path: file_path.clone(),
                        error: error.to_string(),
                    });
                }
            }
        }

        let assets = self.hydrate_asset_summaries(assets).await;

        Ok(ImportResult { imported, reused, failed, assets })
    }

    pub async fn import_remote_images(
        &self,
        request: ImportRemoteImagesRequest,
    ) -> Result<ImportResult> {
        self.validate_import_folders(&request.virtual_folder_ids).await?;

        let mut remote_sources = Vec::new();
        let mut seen_sources = HashSet::new();
        for payload in &request.sources {
            for source in remote_image::extract_remote_image_sources(payload) {
                if seen_sources.insert(source.clone()) {
                    remote_sources.push(source);
                }
            }
        }

        let import_request = ImportRequest {
            file_paths: Vec::new(),
            virtual_folder_ids: request.virtual_folder_ids,
        };
        let mut imported = 0_usize;
        let mut reused = 0_usize;
        let mut failed = Vec::new();
        let mut assets = Vec::new();

        for source in remote_sources {
            let import_result = async {
                let downloaded =
                    remote_image::download_remote_image(&source).await?;
                self.import_image_bytes_as_temp(
                    &import_request,
                    &downloaded.bytes,
                    &downloaded.file_name,
                )
                .await
            }
            .await;

            match import_result {
                Ok(Some((asset, is_reused))) => {
                    if is_reused {
                        reused += 1;
                    } else {
                        imported += 1;
                    }
                    assets.push(asset);
                }
                Ok(None) => {}
                Err(error) => {
                    failed.push(ImportFailure {
                        file_path: source,
                        error: error.to_string(),
                    });
                }
            }
        }

        let assets = self.hydrate_asset_summaries(assets).await;

        Ok(ImportResult { imported, reused, failed, assets })
    }

    pub async fn import_capture_result(
        &self,
        bytes: &[u8],
        file_name: &str,
    ) -> Result<AssetSummary> {
        let hash = media::hash_bytes(bytes);
        if let Some(existing) =
            self.asset_repository.load_by_hash(&hash).await?
        {
            return Ok(self.hydrate_asset_summary(existing).await);
        }

        let tmp_file =
            ensure_unique_path(self.library_storage.temp_file(file_name))
                .await?;
        media::persist_bytes(&tmp_file, bytes).await?;

        let destination =
            self.library_storage.target_asset_path(&hash, &tmp_file);
        let destination_existed = fs::metadata(&destination).await.is_ok();
        if !destination_existed {
            media::copy_file(&tmp_file, &destination).await?;
        }

        let thumb_path = self.library_storage.thumbnail_path(&hash);
        let thumbnail_existed = fs::metadata(&thumb_path).await.is_ok();
        let result = async {
            media::ensure_thumbnail(&destination, &thumb_path).await?;
            let (width, height) = media::image_dimensions(&destination).await?;
            let metadata = fs::metadata(&destination).await?;
            let now = get_now_date();
            let asset_id = get_unique_id();
            let mime = media::source_mime(&destination);

            let mut tx = self.asset_repository.begin().await?;
            self.asset_repository
                .insert_imported_in_tx(
                    &mut tx,
                    &NewImportedAssetInput {
                        id: &asset_id,
                        hash: &hash,
                        file_name,
                        file_size: metadata.len() as i64,
                        mime_type: &mime,
                        width: width as i64,
                        height: height as i64,
                        modified_at: None,
                        source_type: CROQUIS_RESULT_ASSET_SOURCE,
                        created_at: &now,
                    },
                )
                .await?;
            tx.commit().await?;

            Ok::<_, anyhow::Error>(asset_id)
        }
        .await;

        let _ = fs::remove_file(&tmp_file).await;
        match result {
            Ok(asset_id) => {
                let asset =
                    self.asset_repository.get_summary(&asset_id).await?;
                Ok(self.hydrate_asset_summary(asset).await)
            }
            Err(error) => {
                if !destination_existed {
                    let _ = fs::remove_file(&destination).await;
                }
                if !thumbnail_existed {
                    let _ = fs::remove_file(&thumb_path).await;
                }
                Err(error)
            }
        }
    }

    async fn import_image_bytes_as_temp(
        &self,
        request: &ImportRequest,
        bytes: &[u8],
        file_name: &str,
    ) -> Result<Option<(AssetSummary, bool)>> {
        let tmp_file =
            ensure_unique_path(self.library_storage.temp_file(file_name))
                .await?;
        media::persist_bytes(&tmp_file, bytes).await?;

        let tmp_file_path = tmp_file.to_string_lossy().into_owned();
        let result = self.import_image_asset(request, &tmp_file_path).await;
        let _ = fs::remove_file(&tmp_file).await;

        result
    }

    pub async fn load_assets_by_ids(
        &self,
        asset_ids: &[String],
    ) -> Result<Vec<AssetSummary>> {
        let assets =
            self.asset_repository.load_many_summaries(asset_ids).await?;
        Ok(self.hydrate_asset_summaries(assets).await)
    }

    pub fn resolve_asset_source_path(
        &self,
        asset: &AssetSummary,
    ) -> Option<PathBuf> {
        Some(self.library_storage.asset_source_path(asset))
    }

    async fn hydrate_asset_detail(
        &self,
        mut detail: AssetDetail,
    ) -> AssetDetail {
        self.library_storage.hydrate_asset_paths(&mut detail.asset).await;
        detail
    }

    async fn hydrate_asset_summaries(
        &self,
        assets: Vec<AssetSummary>,
    ) -> Vec<AssetSummary> {
        let mut hydrated = Vec::with_capacity(assets.len());
        for asset in assets {
            hydrated.push(self.hydrate_asset_summary(asset).await);
        }
        hydrated
    }

    async fn hydrate_asset_summary(
        &self,
        mut asset: AssetSummary,
    ) -> AssetSummary {
        self.library_storage.hydrate_asset_paths(&mut asset).await;
        asset
    }

    async fn import_image_asset(
        &self,
        request: &ImportRequest,
        file_path: &str,
    ) -> Result<Option<(AssetSummary, bool)>> {
        let source = PathBuf::from(file_path);
        if !media::is_supported_image(&source) {
            return Ok(None);
        }

        let metadata = fs::metadata(&source).await.with_context(|| {
            format!("Failed to read metadata for {}", source.display())
        })?;
        if !metadata.is_file() {
            return Ok(None);
        }

        let hash = media::hash_file(&source).await?;
        if let Some(existing) =
            self.asset_repository.load_by_hash(&hash).await?
        {
            self.asset_repository.mark_as_import_source(&existing.id).await?;
            self.apply_asset_folder_assignments(
                &existing.id,
                &request.virtual_folder_ids,
                AssetFolderAssignmentMode::Append,
            )
            .await?;
            return Ok(Some((
                self.asset_repository.get_summary(&existing.id).await?,
                true,
            )));
        }

        let file_name = source
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| anyhow!("Invalid file name: {}", source.display()))?
            .to_string();
        let destination =
            self.library_storage.target_asset_path(&hash, &source);
        let destination_existed = fs::metadata(&destination).await.is_ok();
        if !destination_existed {
            media::copy_file(&source, &destination).await?;
        }

        let thumb_path = self.library_storage.thumbnail_path(&hash);
        let thumbnail_existed = fs::metadata(&thumb_path).await.is_ok();
        let result = async {
            let _ = media::ensure_thumbnail(&destination, &thumb_path).await?;
            let (width, height) = media::image_dimensions(&destination).await?;
            let modified_at = file_mtime_epoch(&metadata).ok();
            let now = get_now_date();
            let asset_id = get_unique_id();
            let mime = media::source_mime(&source);

            let mut tx = self.asset_repository.begin().await?;
            self.asset_repository
                .insert_imported_in_tx(
                    &mut tx,
                    &NewImportedAssetInput {
                        id: &asset_id,
                        hash: &hash,
                        file_name: &file_name,
                        file_size: metadata.len() as i64,
                        mime_type: &mime,
                        width: width as i64,
                        height: height as i64,
                        modified_at,
                        source_type: IMPORTED_ASSET_SOURCE,
                        created_at: &now,
                    },
                )
                .await?;
            self.apply_asset_folder_assignments_in_tx(
                &mut tx,
                &asset_id,
                &request.virtual_folder_ids,
                AssetFolderAssignmentMode::Append,
            )
            .await?;
            tx.commit().await?;

            Ok::<_, anyhow::Error>(asset_id)
        }
        .await;

        match result {
            Ok(asset_id) => Ok(Some((
                self.asset_repository.get_summary(&asset_id).await?,
                false,
            ))),
            Err(error) => {
                if !destination_existed {
                    let _ = fs::remove_file(&destination).await;
                }
                if !thumbnail_existed {
                    let _ = fs::remove_file(&thumb_path).await;
                }
                Err(error)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use base64::{
        engine::general_purpose::STANDARD as BASE64_STANDARD, Engine,
    };

    use crate::{
        models::{
            asset::{
                AssetListSource, ImportRemoteImagesRequest, ImportRequest,
                UpdateAssetFoldersPayload,
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
            bootstrap::{ensure_schema, open_or_create_db, seed_defaults},
            LibraryPaths,
        },
        utils::media,
    };

    const BMP_1X1: &[u8] = &[
        66, 77, 58, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0, 1, 0, 0, 0,
        1, 0, 0, 0, 1, 0, 24, 0, 0, 0, 0, 0, 4, 0, 0, 0, 19, 11, 0, 0, 19, 11,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0,
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

    #[tokio::test]
    async fn asset_reads_hydrate_storage_and_thumbnail_paths() {
        let dir = make_temp_dir("hydrate-paths");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

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

        let detail =
            service.get_asset(&imported.id).await.expect("missing detail");
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
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

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
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

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
        let source_asset_id = import_result
            .assets
            .first()
            .expect("missing source asset")
            .id
            .clone();

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
            .delete(crate::models::record::DeleteCroquisRecordPayload {
                record_id,
            })
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
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

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
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

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
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

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
        assert_eq!(
            detail.last_croquis_at.as_deref(),
            Some("2031-01-01T00:00:00Z")
        );
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
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

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
        let expected_asset_path = imported
            .storage_path
            .clone()
            .expect("missing hydrated storage path");
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
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

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
    async fn moving_last_asset_out_of_system_uncategorized_cleans_up_folder() {
        let dir = make_temp_dir("cleanup-system-child");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

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
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

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
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

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
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

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

        let data_url = format!(
            "data:image/bmp;base64,{}",
            BASE64_STANDARD.encode(BMP_1X1)
        );
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
}

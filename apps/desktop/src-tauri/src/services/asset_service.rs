use std::{
    collections::HashSet,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, Context, Result};
use sqlx::{Sqlite, Transaction};
use tokio::fs;

use crate::{
    models::asset::{
        AssetDetail, AssetListSource, AssetSummary, ImportRequest,
        ImportResult, UpdateAssetFoldersPayload,
    },
    repositories::{AssetRepository, FolderRepository, NewImportedAssetInput},
    services::LibraryStorage,
    utils::{
        date::get_now_date, file_ops::ensure_unique_path,
        file_utils::file_mtime_epoch, identifier::get_unique_id, media,
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
        self.asset_repository.list_by_source(source).await
    }

    pub async fn get_asset(&self, asset_id: &str) -> Result<AssetDetail> {
        self.asset_repository.get_detail(asset_id).await
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
        self.asset_repository.get_detail(&asset_id).await
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

    pub async fn reveal_path(&self, path: &Path) -> Result<()> {
        self.library_storage.reveal_path(path).await
    }

    pub async fn import_images(
        &self,
        request: ImportRequest,
    ) -> Result<ImportResult> {
        let mut imported = 0_usize;
        let mut reused = 0_usize;
        let mut assets = Vec::new();

        for file_path in &request.file_paths {
            if let Some((asset, is_reused)) =
                self.import_image_asset(&request, file_path).await?
            {
                if is_reused {
                    reused += 1;
                } else {
                    imported += 1;
                }
                assets.push(asset);
            }
        }

        Ok(ImportResult { imported, reused, assets })
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
            return Ok(existing);
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
            Ok(asset_id) => self.asset_repository.get_summary(&asset_id).await,
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

    pub async fn load_assets_by_ids(
        &self,
        asset_ids: &[String],
    ) -> Result<Vec<AssetSummary>> {
        self.asset_repository.load_many_summaries(asset_ids).await
    }

    pub fn resolve_asset_source_path(
        &self,
        asset: &AssetSummary,
    ) -> Option<PathBuf> {
        Some(self.library_storage.asset_path(&asset.hash, &asset.file_name))
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

    use crate::{
        models::{
            asset::{ImportRequest, UpdateAssetFoldersPayload},
            folder::{
                DeleteVirtualFolderPayload, SaveVirtualFolderPayload,
                VirtualFolderKind,
            },
        },
        repositories::{AssetRepository, FolderRepository},
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
}

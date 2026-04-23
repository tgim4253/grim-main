use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use tokio::fs;

use crate::{
    models::asset::{
        AssetDetail, AssetListSource, AssetSummary, ImportRequest,
        ImportResult, UpdateAssetFoldersPayload, UpdateAssetTagsPayload,
    },
    repositories::{
        AssetRepository, NewImportedAssetInput, NewLinkedAssetInput,
    },
    services::LibraryStorage,
    utils::{
        date::get_now_date, file_ops::ensure_unique_path,
        file_utils::file_mtime_epoch, identifier::get_unique_id, media,
    },
};

#[derive(Clone)]
pub struct AssetService {
    asset_repository: AssetRepository,
    library_storage: LibraryStorage,
}

impl AssetService {
    pub fn new(
        asset_repository: AssetRepository,
        library_storage: LibraryStorage,
    ) -> Self {
        Self { asset_repository, library_storage }
    }

    pub async fn count_all_assets(&self) -> Result<i64> {
        self.asset_repository.count_all().await
    }

    pub async fn count_uncategorized_assets(&self) -> Result<i64> {
        self.asset_repository.count_uncategorized().await
    }

    pub async fn list_assets(
        &self,
        source: AssetListSource,
    ) -> Result<Vec<AssetSummary>> {
        self.asset_repository.list(source).await
    }

    pub async fn get_asset(&self, asset_id: &str) -> Result<AssetDetail> {
        self.asset_repository.get_detail(asset_id).await
    }

    pub async fn update_asset_folders(
        &self,
        payload: UpdateAssetFoldersPayload,
    ) -> Result<AssetDetail> {
        let asset_id = payload.asset_id.clone();
        let mut tx = self.asset_repository.begin().await?;
        self.asset_repository
            .replace_folders_in_tx(
                &mut tx,
                &asset_id,
                &payload.virtual_folder_ids,
            )
            .await?;
        tx.commit().await?;
        self.asset_repository.get_detail(&asset_id).await
    }

    pub async fn update_asset_tags(
        &self,
        payload: UpdateAssetTagsPayload,
    ) -> Result<AssetDetail> {
        let asset_id = payload.asset_id.clone();
        let mut tx = self.asset_repository.begin().await?;
        self.asset_repository
            .replace_tags_in_tx(&mut tx, &asset_id, &payload.tag_ids)
            .await?;
        tx.commit().await?;
        self.asset_repository.get_detail(&asset_id).await
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

        Ok(ImportResult { imported, reused, linked: 0, assets })
    }

    pub async fn link_external_files(
        &self,
        request: ImportRequest,
    ) -> Result<ImportResult> {
        let mut linked = 0_usize;
        let mut reused = 0_usize;
        let mut assets = Vec::new();

        for file_path in &request.file_paths {
            if let Some((asset, is_reused)) =
                self.link_external_asset(&request, file_path).await?
            {
                if is_reused {
                    reused += 1;
                } else {
                    linked += 1;
                }
                assets.push(asset);
            }
        }

        Ok(ImportResult { imported: 0, reused, linked, assets })
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
            let destination_text = destination.to_string_lossy().to_string();
            let thumb_text = thumb_path.to_string_lossy().to_string();
            let mime = media::source_mime(&destination);

            let mut tx = self.asset_repository.begin().await?;
            self.asset_repository
                .insert_imported_in_tx(
                    &mut tx,
                    &NewImportedAssetInput {
                        id: &asset_id,
                        hash: &hash,
                        storage_path: &destination_text,
                        thumbnail_path: &thumb_text,
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
        asset
            .storage_path
            .as_deref()
            .or(asset.external_path.as_deref())
            .map(PathBuf::from)
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
            let mut tx = self.asset_repository.begin().await?;
            self.asset_repository
                .assign_folders_and_tags_in_tx(
                    &mut tx,
                    &existing.id,
                    &request.virtual_folder_ids,
                    &request.tag_ids,
                )
                .await?;
            tx.commit().await?;
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
            let destination_text = destination.to_string_lossy().to_string();
            let thumb_text = thumb_path.to_string_lossy().to_string();
            let mime = media::source_mime(&source);

            let mut tx = self.asset_repository.begin().await?;
            self.asset_repository
                .insert_imported_in_tx(
                    &mut tx,
                    &NewImportedAssetInput {
                        id: &asset_id,
                        hash: &hash,
                        storage_path: &destination_text,
                        thumbnail_path: &thumb_text,
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
            self.asset_repository
                .assign_folders_and_tags_in_tx(
                    &mut tx,
                    &asset_id,
                    &request.virtual_folder_ids,
                    &request.tag_ids,
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

    async fn link_external_asset(
        &self,
        request: &ImportRequest,
        file_path: &str,
    ) -> Result<Option<(AssetSummary, bool)>> {
        let source = PathBuf::from(file_path);
        let metadata = fs::metadata(&source).await.with_context(|| {
            format!("Failed to read metadata for {}", source.display())
        })?;
        if !metadata.is_file() {
            return Ok(None);
        }

        if let Some(existing) =
            self.asset_repository.load_by_external_path(file_path).await?
        {
            let mut tx = self.asset_repository.begin().await?;
            self.asset_repository
                .assign_folders_and_tags_in_tx(
                    &mut tx,
                    &existing.id,
                    &request.virtual_folder_ids,
                    &request.tag_ids,
                )
                .await?;
            tx.commit().await?;
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
        let mime = media::source_mime(&source);
        let modified_at = file_mtime_epoch(&metadata).ok();
        let now = get_now_date();
        let asset_id = get_unique_id();

        let (thumbnail_path, width, height, thumbnail_existed) =
            if media::is_supported_image(&source) {
                let hash = media::hash_file(&source).await?;
                let thumb_path = self.library_storage.thumbnail_path(&hash);
                let thumb_existed = fs::metadata(&thumb_path).await.is_ok();
                let _ = media::ensure_thumbnail(&source, &thumb_path).await?;
                let (width, height) = media::image_dimensions(&source).await?;
                (
                    Some(thumb_path.to_string_lossy().to_string()),
                    Some(width as i64),
                    Some(height as i64),
                    thumb_existed,
                )
            } else {
                (None, None, None, false)
            };

        let result = async {
            let mut tx = self.asset_repository.begin().await?;
            self.asset_repository
                .insert_linked_in_tx(
                    &mut tx,
                    &NewLinkedAssetInput {
                        id: &asset_id,
                        external_path: file_path,
                        thumbnail_path: thumbnail_path.as_deref(),
                        file_name: &file_name,
                        file_size: metadata.len() as i64,
                        mime_type: &mime,
                        width,
                        height,
                        modified_at,
                        created_at: &now,
                    },
                )
                .await?;
            self.asset_repository
                .assign_folders_and_tags_in_tx(
                    &mut tx,
                    &asset_id,
                    &request.virtual_folder_ids,
                    &request.tag_ids,
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
                if let Some(path) = thumbnail_path.as_ref() {
                    if !thumbnail_existed {
                        let _ = fs::remove_file(path).await;
                    }
                }
                Err(error)
            }
        }
    }
}

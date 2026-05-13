use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use tokio::fs;

use crate::{
    models::asset::{AssetSummary, ImportFailure, ImportRequest, ImportResult},
    repositories::{NewImportedAssetInput, IMPORTED_ASSET_SOURCE},
    utils::{
        date::get_now_date, file_ops::ensure_unique_path,
        file_utils::file_mtime_epoch, identifier::get_unique_id, media,
    },
};

use super::{folder_assignment::AssetFolderAssignmentMode, AssetService};

impl AssetService {
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

    pub(super) async fn import_image_bytes_as_temp(
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

    pub(super) async fn import_image_asset(
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

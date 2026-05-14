use anyhow::Result;
use tokio::fs;

use crate::{
    models::asset::AssetSummary,
    repositories::{NewImportedAssetInput, CROQUIS_RESULT_ASSET_SOURCE},
    utils::{
        date::get_now_date, file_ops::ensure_unique_path,
        identifier::get_unique_id, media,
    },
};

use super::AssetService;

impl AssetService {
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
}

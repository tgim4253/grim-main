use std::collections::HashSet;

use anyhow::Result;

use crate::{
    models::asset::{
        ImportFailure, ImportRemoteImagesRequest, ImportRequest, ImportResult,
    },
    utils::remote_image,
};

use super::AssetService;

impl AssetService {
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
}

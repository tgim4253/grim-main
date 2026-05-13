use std::path::Path;

use anyhow::Result;

mod capture_result;
mod folder_assignment;
mod hydration;
mod import_local;
mod import_preview;
mod import_remote;

#[cfg(test)]
mod tests;

use crate::{
    models::asset::{
        AssetDetail, AssetListSource, AssetRecordCount, AssetSummary,
    },
    repositories::{AssetRepository, FolderRepository},
    services::LibraryStorage,
};

#[derive(Clone)]
pub struct AssetService {
    asset_repository: AssetRepository,
    folder_repository: FolderRepository,
    library_storage: LibraryStorage,
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

    pub async fn list_asset_record_counts(
        &self,
        source: AssetListSource,
    ) -> Result<Vec<AssetRecordCount>> {
        self.asset_repository.list_record_counts_by_source(source).await
    }

    pub async fn get_asset(&self, asset_id: &str) -> Result<AssetDetail> {
        let detail = self.asset_repository.get_detail(asset_id).await?;
        Ok(self.hydrate_asset_detail(detail).await)
    }

    pub async fn reveal_path(&self, path: &Path) -> Result<()> {
        self.library_storage.reveal_path(path).await
    }
}

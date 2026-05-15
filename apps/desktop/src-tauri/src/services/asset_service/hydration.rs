use std::path::PathBuf;

use anyhow::Result;

use crate::models::asset::{AssetDetail, AssetSummary};

use super::AssetService;

impl AssetService {
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

    pub(super) async fn hydrate_asset_detail(
        &self,
        mut detail: AssetDetail,
    ) -> AssetDetail {
        self.library_storage.hydrate_asset_paths(&mut detail.asset).await;
        detail
    }

    pub(super) async fn hydrate_asset_summaries(
        &self,
        assets: Vec<AssetSummary>,
    ) -> Vec<AssetSummary> {
        let mut hydrated = Vec::with_capacity(assets.len());
        for asset in assets {
            hydrated.push(self.hydrate_asset_summary(asset).await);
        }
        hydrated
    }

    pub(super) async fn hydrate_asset_summary(
        &self,
        mut asset: AssetSummary,
    ) -> AssetSummary {
        self.library_storage.hydrate_asset_paths(&mut asset).await;
        asset
    }
}

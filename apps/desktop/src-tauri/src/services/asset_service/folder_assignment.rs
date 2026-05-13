use std::collections::HashSet;

use anyhow::Result;
use sqlx::{Sqlite, Transaction};

use crate::models::asset::{
    AssetDetail, BatchUpdateAssetFoldersMode, BatchUpdateAssetFoldersPayload,
    UpdateAssetFoldersPayload,
};

use super::AssetService;

#[derive(Clone, Copy)]
pub(super) enum AssetFolderAssignmentMode {
    Replace,
    Append,
}

impl AssetService {
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

    pub async fn batch_update_asset_folders(
        &self,
        payload: BatchUpdateAssetFoldersPayload,
    ) -> Result<Vec<AssetDetail>> {
        if payload.asset_ids.is_empty() {
            return Ok(Vec::new());
        }

        for asset_id in &payload.asset_ids {
            let _ = self.asset_repository.get_summary(asset_id).await?;
        }

        let mode = match payload.mode {
            BatchUpdateAssetFoldersMode::Append => {
                AssetFolderAssignmentMode::Append
            }
            BatchUpdateAssetFoldersMode::Replace => {
                AssetFolderAssignmentMode::Replace
            }
        };

        let mut tx = self.asset_repository.begin().await?;
        for asset_id in &payload.asset_ids {
            self.apply_asset_folder_assignments_in_tx(
                &mut tx,
                asset_id,
                &payload.virtual_folder_ids,
                mode,
            )
            .await?;
        }
        tx.commit().await?;

        let mut details = Vec::with_capacity(payload.asset_ids.len());
        for asset_id in payload.asset_ids {
            let detail = self.asset_repository.get_detail(&asset_id).await?;
            details.push(self.hydrate_asset_detail(detail).await);
        }

        Ok(details)
    }

    pub(super) async fn apply_asset_folder_assignments(
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

    pub(super) async fn apply_asset_folder_assignments_in_tx(
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

    pub(super) async fn validate_import_folders(
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
}

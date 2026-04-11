use anyhow::Result;

use crate::{
    models::folder::{
        DeleteVirtualFolderPayload, SaveVirtualFolderPayload,
        SaveVirtualFolderResult, VirtualFolder,
    },
    repositories::FolderRepository,
};

#[derive(Clone)]
pub struct FolderService {
    folder_repository: FolderRepository,
}

impl FolderService {
    pub fn new(folder_repository: FolderRepository) -> Self {
        Self { folder_repository }
    }

    pub async fn load_virtual_folders(&self) -> Result<Vec<VirtualFolder>> {
        self.folder_repository.load_all().await
    }

    pub async fn search_virtual_folders(
        &self,
        query: &str,
    ) -> Result<Vec<VirtualFolder>> {
        self.folder_repository.search(query).await
    }

    pub async fn save_virtual_folder(
        &self,
        payload: SaveVirtualFolderPayload,
    ) -> Result<SaveVirtualFolderResult> {
        let saved_folder_id = self.folder_repository.save(payload).await?;
        let folders = self.folder_repository.load_all().await?;
        Ok(SaveVirtualFolderResult { saved_folder_id, folders })
    }

    pub async fn delete_virtual_folder(
        &self,
        payload: DeleteVirtualFolderPayload,
    ) -> Result<Vec<VirtualFolder>> {
        self.folder_repository.delete(&payload.folder_id).await?;
        self.folder_repository.load_all().await
    }
}

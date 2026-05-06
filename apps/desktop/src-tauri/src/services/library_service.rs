use anyhow::Result;

use crate::{
    models::{
        library::{ExplorerSnapshot, LibrarySnapshot},
        tag::{Tag, TagGroup},
    },
    services::{
        AssetService, FolderService, RecordService, SessionService, TagService,
    },
};

#[derive(Clone)]
pub struct LibraryService {
    asset_service: AssetService,
    folder_service: FolderService,
    tag_service: TagService,
    session_service: SessionService,
    record_service: RecordService,
}

impl LibraryService {
    pub fn new(
        asset_service: AssetService,
        folder_service: FolderService,
        tag_service: TagService,
        session_service: SessionService,
        record_service: RecordService,
    ) -> Self {
        Self {
            asset_service,
            folder_service,
            tag_service,
            session_service,
            record_service,
        }
    }

    pub async fn load_library_snapshot(&self) -> Result<LibrarySnapshot> {
        let explorer = self.load_explorer_snapshot().await?;
        let session_presets =
            self.session_service.list_session_presets().await?;
        let tag_groups: Vec<TagGroup> =
            self.tag_service.list_tag_groups().await?;
        let tags: Vec<Tag> = self.tag_service.list_tags().await?;

        Ok(LibrarySnapshot { explorer, session_presets, tag_groups, tags })
    }

    pub async fn load_explorer_snapshot(&self) -> Result<ExplorerSnapshot> {
        Ok(ExplorerSnapshot {
            virtual_folders: self.folder_service.load_virtual_folders().await?,
            folder_stats: self.folder_service.load_folder_stats().await?,
            all_assets_count: self.asset_service.count_all_assets().await?,
            unassigned_assets_count: self
                .asset_service
                .count_unassigned_assets()
                .await?,
            recent_records: self
                .record_service
                .list_recent_records(Some(12))
                .await?,
        })
    }
}

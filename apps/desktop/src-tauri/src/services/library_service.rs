use anyhow::Result;

use crate::{
    models::{
        library::{ExplorerSnapshot, LibrarySnapshot},
        tag::{Tag, TagGroup},
    },
    services::{
        AssetService, FolderService, RecordService, SessionService,
        SettingsService, TagService,
    },
};

#[derive(Clone)]
pub struct LibraryService {
    settings_service: SettingsService,
    asset_service: AssetService,
    folder_service: FolderService,
    tag_service: TagService,
    session_service: SessionService,
    record_service: RecordService,
}

impl LibraryService {
    pub fn new(
        settings_service: SettingsService,
        asset_service: AssetService,
        folder_service: FolderService,
        tag_service: TagService,
        session_service: SessionService,
        record_service: RecordService,
    ) -> Self {
        Self {
            settings_service,
            asset_service,
            folder_service,
            tag_service,
            session_service,
            record_service,
        }
    }

    pub async fn load_snapshot(&self) -> Result<LibrarySnapshot> {
        let settings = self.settings_service.load_settings().await?;
        let explorer = ExplorerSnapshot {
            virtual_folders: self.folder_service.load_virtual_folders().await?,
            all_assets_count: self.asset_service.count_all_assets().await?,
            uncategorized_count: self
                .asset_service
                .count_uncategorized_assets()
                .await?,
            recent_records: self.record_service.list_recent_records(12).await?,
        };
        let session_presets =
            self.session_service.list_session_presets().await?;
        let tag_groups: Vec<TagGroup> =
            self.tag_service.list_tag_groups().await?;
        let tags: Vec<Tag> = self.tag_service.list_tags().await?;

        Ok(LibrarySnapshot {
            settings,
            explorer,
            session_presets,
            tag_groups,
            tags,
        })
    }
}

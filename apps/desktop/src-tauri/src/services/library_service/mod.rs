use std::path::Path;

use anyhow::Result;

use crate::{
    models::library::{
        AssetDetail, AssetListSource, AssetSummary, CroquisRecordDetail,
        CroquisRecordSummary, DeleteCroquisRecordPayload,
        DeleteSessionPresetPayload, DeleteTagGroupPayload, DeleteTagPayload,
        DeleteVirtualFolderPayload, FinalizeCroquisRecordPayload,
        ImportRequest, ImportResult, LibrarySettings, LibrarySnapshot,
        SaveCroquisRecordPayload, SaveSessionPresetPayload,
        SaveTagGroupPayload, SaveTagPayload, SaveVirtualFolderPayload,
        SaveVirtualFolderResult,
        SessionDetail, SessionPreset, SessionSummary, TagIndex,
        UpdateAssetFoldersPayload, UpdateAssetTagsPayload,
        UpdateCroquisRecordTagsPayload, VirtualFolder,
    },
    state::AppState,
};

mod assets;
mod folders;
mod mappers;
mod records;
mod runtime;
mod sessions;
mod settings;
mod tags;

pub use assets::{
    get_asset, import_capture_result, import_images, link_external_files,
    list_assets, load_assets_by_ids, resolve_asset_source_path, reveal_path,
    update_asset_folders, update_asset_tags,
};
pub use folders::{
    delete_virtual_folder, save_virtual_folder, search_virtual_folders,
};
pub use records::{
    attach_result_asset, delete_record, finalize_record, get_record,
    list_recent_records, mark_record_started, save_record, update_record_tags,
};
pub use runtime::{init, library_paths, LibraryPaths};
pub use sessions::{
    create_session, create_session_record, delete_session_preset,
    get_session_detail, list_recent_sessions, list_session_presets,
    load_session_preset, save_session_preset,
};
pub use settings::{load_settings, load_snapshot, save_settings};
pub use tags::{
    delete_tag, delete_tag_group, load_tag_index, save_tag, save_tag_group,
};

pub(super) const LIBRARY_ID: &str = "library";
pub(super) const TAG_GROUP_SESSION_STEPS: &str = "Session Steps";

#[derive(Clone, Default)]
pub struct LibraryService;

impl LibraryService {
    pub fn new(_app_state: AppState) -> Self {
        Self
    }

    pub async fn load_snapshot(&self) -> Result<LibrarySnapshot> {
        load_snapshot().await
    }

    pub async fn load_settings(&self) -> Result<LibrarySettings> {
        load_settings().await
    }

    pub async fn save_settings(
        &self,
        payload: LibrarySettings,
    ) -> Result<LibrarySettings> {
        save_settings(payload).await
    }

    pub async fn save_virtual_folder(
        &self,
        payload: SaveVirtualFolderPayload,
    ) -> Result<SaveVirtualFolderResult> {
        save_virtual_folder(payload).await
    }

    pub async fn delete_virtual_folder(
        &self,
        payload: DeleteVirtualFolderPayload,
    ) -> Result<Vec<VirtualFolder>> {
        delete_virtual_folder(payload).await
    }

    pub async fn search_virtual_folders(
        &self,
        query: &str,
    ) -> Result<Vec<VirtualFolder>> {
        search_virtual_folders(query).await
    }

    pub async fn list_assets(
        &self,
        source: AssetListSource,
    ) -> Result<Vec<AssetSummary>> {
        list_assets(source).await
    }

    pub async fn get_asset(&self, asset_id: &str) -> Result<AssetDetail> {
        get_asset(asset_id).await
    }

    pub async fn update_asset_folders(
        &self,
        payload: UpdateAssetFoldersPayload,
    ) -> Result<AssetDetail> {
        update_asset_folders(payload).await
    }

    pub async fn update_asset_tags(
        &self,
        payload: UpdateAssetTagsPayload,
    ) -> Result<AssetDetail> {
        update_asset_tags(payload).await
    }

    pub async fn reveal_path(&self, path: &Path) -> Result<()> {
        reveal_path(path).await
    }

    pub async fn import_images(
        &self,
        payload: ImportRequest,
    ) -> Result<ImportResult> {
        import_images(payload).await
    }

    pub async fn link_external_files(
        &self,
        payload: ImportRequest,
    ) -> Result<ImportResult> {
        link_external_files(payload).await
    }

    pub async fn list_recent_records(
        &self,
        limit: i64,
    ) -> Result<Vec<CroquisRecordSummary>> {
        list_recent_records(limit).await
    }

    pub async fn get_record(
        &self,
        record_id: &str,
    ) -> Result<CroquisRecordDetail> {
        get_record(record_id).await
    }

    pub async fn save_record(
        &self,
        payload: SaveCroquisRecordPayload,
    ) -> Result<CroquisRecordDetail> {
        save_record(payload).await
    }

    pub async fn delete_record(
        &self,
        payload: DeleteCroquisRecordPayload,
    ) -> Result<()> {
        delete_record(payload).await
    }

    pub async fn mark_record_started(
        &self,
        record_id: &str,
    ) -> Result<CroquisRecordDetail> {
        mark_record_started(record_id).await
    }

    pub async fn finalize_record(
        &self,
        payload: FinalizeCroquisRecordPayload,
    ) -> Result<CroquisRecordDetail> {
        finalize_record(payload).await
    }

    pub async fn update_record_tags(
        &self,
        payload: UpdateCroquisRecordTagsPayload,
    ) -> Result<CroquisRecordDetail> {
        update_record_tags(payload).await
    }

    pub async fn list_recent_sessions(
        &self,
        limit: i64,
    ) -> Result<Vec<SessionSummary>> {
        list_recent_sessions(limit).await
    }

    pub async fn get_session_detail(
        &self,
        session_id: &str,
    ) -> Result<SessionDetail> {
        get_session_detail(session_id).await
    }

    pub async fn list_session_presets(&self) -> Result<Vec<SessionPreset>> {
        list_session_presets().await
    }

    pub async fn save_session_preset(
        &self,
        payload: SaveSessionPresetPayload,
    ) -> Result<Vec<SessionPreset>> {
        save_session_preset(payload).await
    }

    pub async fn delete_session_preset(
        &self,
        payload: DeleteSessionPresetPayload,
    ) -> Result<Vec<SessionPreset>> {
        delete_session_preset(payload).await
    }

    pub async fn load_tag_index(&self) -> Result<TagIndex> {
        load_tag_index().await
    }

    pub async fn save_tag_group(
        &self,
        payload: SaveTagGroupPayload,
    ) -> Result<TagIndex> {
        save_tag_group(payload).await
    }

    pub async fn delete_tag_group(
        &self,
        payload: DeleteTagGroupPayload,
    ) -> Result<TagIndex> {
        delete_tag_group(payload).await
    }

    pub async fn save_tag(&self, payload: SaveTagPayload) -> Result<TagIndex> {
        save_tag(payload).await
    }

    pub async fn delete_tag(
        &self,
        payload: DeleteTagPayload,
    ) -> Result<TagIndex> {
        delete_tag(payload).await
    }
}

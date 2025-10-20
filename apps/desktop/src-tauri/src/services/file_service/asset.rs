use anyhow::Result;
use sqlx::{Sqlite, Transaction};

use crate::{
    db::repository::file_repository::FileRepository,
    models::file::{FileInfo, FileType},
};

/// Persist file path, content, and asset bindings, returning the associated asset and path IDs.
pub async fn ensure_file_asset_binding(
    tx: &mut Transaction<'_, Sqlite>,
    file_info: &FileInfo,
) -> Result<(String, String)> {
    let file_path_id =
        FileRepository::insert_file_path(tx.as_mut(), file_info).await?;

    let file_content_id =
        FileRepository::upsert_file_content(tx.as_mut(), file_info).await?;

    let is_dedupable =
        matches!(file_info.kind_guess, FileType::Image | FileType::GraphicTool);

    let existing_path_asset_id =
        FileRepository::find_file_asset_id_by_path(tx.as_mut(), &file_path_id)
            .await?;

    let asset_id = if is_dedupable {
        if let Some(asset_id) = FileRepository::find_file_asset_id_by_content(
            tx.as_mut(),
            &file_content_id,
        )
        .await?
        {
            FileRepository::update_file_asset_content(
                tx.as_mut(),
                &asset_id,
                &file_content_id,
                true,
            )
            .await?;
            asset_id
        } else if let Some(asset_id) = existing_path_asset_id {
            FileRepository::update_file_asset_content(
                tx.as_mut(),
                &asset_id,
                &file_content_id,
                true,
            )
            .await?;
            asset_id
        } else {
            FileRepository::insert_file_asset(
                tx.as_mut(),
                &file_content_id,
                true,
            )
            .await?
        }
    } else if let Some(asset_id) = existing_path_asset_id {
        let binding_count =
            FileRepository::count_paths_for_asset(tx.as_mut(), &asset_id)
                .await?;

        if binding_count > 1 {
            FileRepository::insert_file_asset(
                tx.as_mut(),
                &file_content_id,
                false,
            )
            .await?
        } else {
            FileRepository::update_file_asset_content(
                tx.as_mut(),
                &asset_id,
                &file_content_id,
                false,
            )
            .await?;

            asset_id
        }
    } else {
        FileRepository::insert_file_asset(tx.as_mut(), &file_content_id, false)
            .await?
    };

    FileRepository::upsert_file_path_asset_binding(
        tx.as_mut(),
        &file_path_id,
        &asset_id,
    )
    .await?;

    Ok((asset_id, file_path_id))
}

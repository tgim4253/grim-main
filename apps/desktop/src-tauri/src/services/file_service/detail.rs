use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, Context, Result};
use tokio::fs;

use crate::{
    db::repository::{
        connection_repository::ConnectionRepository,
        file_repository::{FilePathRecord, FileRepository},
        node_repository::NodeRepository,
    },
    models::{
        connection::RelationType,
        file::{
            FileDetail, FileFolderInfo, FileInfo, FilePathDetail,
            FilePathStatus, FileSummary, FileType,
        },
        node::NodeData,
    },
    services::{db::DB_MANAGER, file_service::hash::xxh3_64_of, storage_root},
    utils::path_utils::normalize_path,
};

fn infer_relation_kind(kind: &str) -> RelationType {
    match kind {
        "belongtofolder" => RelationType::BelongToFolder,
        "containsfile" => RelationType::ContainsFile,
        "parentfolder" => RelationType::ParentFolder,
        "childfolder" => RelationType::ChildFolder,
        "relativefile" => RelationType::RelativeFile,
        "relatedimage" => RelationType::RelatedImage,
        "croquisreslink" => RelationType::CroquisResLink,
        "croquisreflink" => RelationType::CroquisRefLink,
        "cropped" => RelationType::Cropped,
        "croppedorigin" => RelationType::CroppedOrigin,
        "referencefile" => RelationType::ReferenceFile,
        "referenceby" => RelationType::ReferenceBy,
        _ => RelationType::BelongToFolder,
    }
}

fn build_file_path_string(record: &FilePathRecord) -> Option<PathBuf> {
    let base = record.abs_path_cached.as_ref()?;
    let mut path = PathBuf::from(base);
    path.push(&record.file_name);
    Some(path)
}

async fn inspect_path(
    path: Option<PathBuf>,
    stored_mtime: Option<i64>,
    expected_hash: &str,
    want_dimensions: bool,
) -> (
    FilePathStatus,
    Option<String>,
    Option<String>,
    bool,
    Option<i64>,
    Option<bool>,
    Option<(u32, u32)>,
) {
    let Some(path_buf) = path else {
        return (
            FilePathStatus::Error,
            None,
            Some("저장된 폴더 경로가 없습니다".to_string()),
            false,
            None,
            None,
            None,
        );
    };

    let mut status = FilePathStatus::Ok;
    let mut warning: Option<String> = None;
    let mut error: Option<String> = None;
    let mut current_mtime = None;
    let mut hash_matches = None;
    let mut dimensions = None;
    let mut exists = false;

    match fs::metadata(&path_buf).await {
        Ok(meta) => {
            if !meta.is_file() {
                status = FilePathStatus::Error;
                error = Some("파일이 존재하지 않습니다".to_string());
            } else {
                exists = true;
                let mtime = FileInfo::file_mtime_epoch(&meta).ok();
                current_mtime = mtime;
                if let (Some(expected), Some(actual)) = (stored_mtime, mtime) {
                    if expected != actual {
                        status = FilePathStatus::Warning;
                        warning =
                            Some("저장된 수정 시간과 다릅니다".to_string());
                    }
                }

                match xxh3_64_of(path_buf.as_path()).await {
                    Ok(hash) => {
                        let matches = hash.eq_ignore_ascii_case(expected_hash);
                        hash_matches = Some(matches);
                        if !matches {
                            status = FilePathStatus::Error;
                            error = Some(
                                "파일 해시가 일치하지 않습니다".to_string(),
                            );
                        } else if want_dimensions {
                            match tokio::task::spawn_blocking({
                                let path = path_buf.clone();
                                move || image::image_dimensions(&path)
                            })
                            .await
                            .ok()
                            .and_then(Result::ok)
                            {
                                Some((w, h)) => {
                                    dimensions = Some((w, h));
                                }
                                None => {
                                    // Ignore dimension errors; they are not critical.
                                }
                            }
                        }
                    }
                    Err(err) => {
                        status = FilePathStatus::Error;
                        error =
                            Some(format!("해시를 계산할 수 없습니다: {err}"));
                    }
                }
            }
        }
        Err(err) => {
            status = FilePathStatus::Error;
            error = Some(format!("파일 메타데이터를 읽을 수 없습니다: {err}"));
        }
    }

    (status, warning, error, exists, current_mtime, hash_matches, dimensions)
}

fn relation_targets<'a>(records: &'a [String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for id in records {
        if seen.insert(id.clone()) {
            out.push(id.clone());
        }
    }
    out
}

/// Fetch detailed metadata for a file content referenced by its hash.
pub async fn get_file_detail(moa_id: &str, hash: &str) -> Result<FileDetail> {
    let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;

    let Some(file_content_id) =
        FileRepository::find_file_content_id(tx.as_mut(), hash.to_string())
            .await?
    else {
        bail!("요청한 파일 정보를 찾을 수 없습니다");
    };

    let Some(file_asset_id) = FileRepository::find_file_asset_id_by_content(
        tx.as_mut(),
        &file_content_id,
    )
    .await?
    else {
        bail!("파일 에셋 정보를 찾을 수 없습니다");
    };

    let Some(file_node_id) = NodeRepository::fetch_node_id_by_asset_id(
        tx.as_mut(),
        file_asset_id.clone(),
    )
    .await?
    else {
        bail!("파일 노드 정보를 찾을 수 없습니다");
    };

    let mut file_nodes = NodeRepository::fetch_nodes_by_ids(
        tx.as_mut(),
        vec![file_node_id.clone()],
    )
    .await?;

    let file_node =
        file_nodes.pop().ok_or_else(|| anyhow!("파일 노드가 비어 있습니다"))?;

    let file_data = match file_node.data {
        Some(NodeData::File(data)) => data,
        _ => bail!("파일 노드 데이터가 손상되었습니다"),
    };

    let connections = ConnectionRepository::fetch_connections(
        tx.as_mut(),
        vec![file_node_id.clone()],
    )
    .await?;

    let folder_ids: Vec<String> = connections
        .iter()
        .filter_map(|conn| {
            if matches!(
                infer_relation_kind(&conn.kind),
                RelationType::BelongToFolder
            ) {
                Some(conn.dst_node_id.clone())
            } else {
                None
            }
        })
        .collect();

    let folder_nodes = if folder_ids.is_empty() {
        Vec::new()
    } else {
        NodeRepository::fetch_nodes_by_ids(
            tx.as_mut(),
            relation_targets(&folder_ids),
        )
        .await?
    };

    let path_records =
        FileRepository::fetch_paths_for_asset(tx.as_mut(), &file_asset_id)
            .await?;

    tx.commit().await?;

    let mut summary = FileSummary {
        file_id: file_data.file_id.clone(),
        node_id: file_data.node_id.clone(),
        file_name: file_data.file_name.clone(),
        mime: file_data.mime.clone(),
        size: file_data.size,
        hash: file_data.xxh3_64.clone(),
        kind: file_data.kind,
        width: None,
        height: None,
    };

    let folders = folder_nodes
        .into_iter()
        .filter_map(|node| match node.data {
            Some(NodeData::Folder(folder)) => Some(FileFolderInfo {
                node_id: node.id,
                name: folder.folder_name,
            }),
            _ => None,
        })
        .collect();

    let mut details = Vec::with_capacity(path_records.len());
    let mut captured_dimensions: Option<(u32, u32)> = None;

    for record in path_records {
        let path_buf = build_file_path_string(&record);
        let path_string =
            path_buf.as_ref().map(|p| p.to_string_lossy().to_string());

        let (status, warning, error, exists, current_mtime, hash_matches, dims) =
            inspect_path(
                path_buf,
                record.stored_mtime,
                &file_data.xxh3_64,
                summary.kind == FileType::Image
                    && captured_dimensions.is_none(),
            )
            .await;

        if captured_dimensions.is_none() {
            captured_dimensions = dims;
        }

        details.push(FilePathDetail {
            id: record.id,
            path: path_string,
            exists,
            stored_mtime: record.stored_mtime,
            current_mtime,
            hash_matches,
            status,
            warning,
            error,
        });
    }

    if let Some((w, h)) = captured_dimensions {
        summary.width = Some(w);
        summary.height = Some(h);
    }

    Ok(FileDetail { file: summary, folders, paths: details })
}

/// Link a filesystem path to an existing file content by hash.
pub async fn link_file_path(
    moa_id: &str,
    hash: &str,
    new_path: &Path,
    replace_path_id: Option<&str>,
) -> Result<FileDetail> {
    let norm_path = normalize_path(new_path);
    let parent = norm_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| anyhow!("파일 경로에 상위 폴더가 없습니다"))?;

    let file_name = norm_path
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| anyhow!("파일 이름을 확인할 수 없습니다"))?
        .to_string();

    let storage_info = storage_root::detect_storage_root(&parent)?;

    let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;

    let real_folder_id = storage_root::ensure_storage_root_and_real_folder(
        &mut tx,
        &storage_info,
        &parent,
    )
    .await?;

    let file_info =
        FileInfo::new(moa_id, &norm_path, real_folder_id, file_name)
            .await
            .context("파일 정보를 계산하지 못했습니다")?;

    if !file_info.xxh3_64.eq_ignore_ascii_case(hash) {
        bail!("선택한 파일이 원본과 일치하지 않습니다");
    }

    let Some(file_content_id) =
        FileRepository::find_file_content_id(tx.as_mut(), hash.to_string())
            .await?
    else {
        bail!("파일 콘텐츠를 찾을 수 없습니다");
    };

    let Some(file_asset_id) = FileRepository::find_file_asset_id_by_content(
        tx.as_mut(),
        &file_content_id,
    )
    .await?
    else {
        bail!("파일 에셋을 찾을 수 없습니다");
    };

    let file_path_id =
        FileRepository::insert_file_path(tx.as_mut(), &file_info).await?;

    FileRepository::upsert_file_path_asset_binding(
        tx.as_mut(),
        &file_path_id,
        &file_asset_id,
    )
    .await?;

    if let Some(old_id) = replace_path_id {
        if old_id != file_path_id {
            FileRepository::delete_file_path(tx.as_mut(), old_id).await?;
        }
    }

    tx.commit().await?;

    get_file_detail(moa_id, hash).await
}

/// Remove an existing file path mapping.
pub async fn remove_file_path(
    moa_id: &str,
    hash: &str,
    file_path_id: &str,
) -> Result<FileDetail> {
    let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;
    FileRepository::delete_file_path(tx.as_mut(), file_path_id).await?;
    tx.commit().await?;
    get_file_detail(moa_id, hash).await
}

/// Open the provided path in the operating system file explorer.
pub async fn reveal_in_file_manager(path: &Path) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        Command::new("open").arg("-R").arg(path).status().with_context(
            || format!("Finder를 실행할 수 없습니다: {}", path.display()),
        )?;
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let mut command = Command::new("explorer.exe");
        command.arg("/select,");
        command.arg(path);
        command.status().with_context(|| {
            format!("Explorer를 실행할 수 없습니다: {}", path.display())
        })?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        use std::process::Command;
        Command::new("xdg-open").arg(path).status().with_context(|| {
            format!("파일 탐색기를 실행할 수 없습니다: {}", path.display())
        })?;
    }

    Ok(())
}

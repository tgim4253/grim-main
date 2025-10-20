use std::collections::HashMap;
use std::path::Path;

use anyhow::{Context, Result};
use tokio::fs;

use crate::models::file::{
    FileType, FolderPreview, FolderPreviewFileStat, FolderPreviewNode,
    FolderPreviewSummary,
};
use crate::utils::path_utils::normalize_path;

use super::super::utils::check_is_hidden;
use super::selection::relative_path_key;

const FILE_TYPE_ORDER: [FileType; 7] = [
    FileType::Image,
    FileType::Video,
    FileType::Document,
    FileType::GraphicTool,
    FileType::Audio,
    FileType::Archive,
    FileType::Unknown,
];

#[derive(Default)]
struct PreviewAccumulator {
    total_folders: u64,
    total_files: u64,
    total_bytes: u64,
    file_type_totals: HashMap<FileType, PreviewFileStats>,
}

#[derive(Default)]
struct PreviewFileStats {
    count: u64,
    bytes: u64,
}

fn stats_map_to_vec(
    map: &HashMap<FileType, PreviewFileStats>,
) -> Vec<FolderPreviewFileStat> {
    let mut out = Vec::new();
    for file_type in FILE_TYPE_ORDER {
        if let Some(stats) = map.get(&file_type) {
            if stats.count > 0 {
                out.push(FolderPreviewFileStat {
                    file_type,
                    count: stats.count,
                    bytes: stats.bytes,
                });
            }
        }
    }

    out
}

/// Traverse the filesystem and produce a preview tree for the selected folder.
pub async fn collect_folder_preview(path: &Path) -> Result<FolderPreview> {
    let norm = normalize_path(path);

    let mut accumulator = PreviewAccumulator::default();
    let root =
        collect_folder_preview_impl(&norm, &norm, &mut accumulator).await?;

    let summary = FolderPreviewSummary {
        total_folders: accumulator.total_folders,
        total_files: accumulator.total_files,
        total_bytes: accumulator.total_bytes,
        file_type_totals: stats_map_to_vec(&accumulator.file_type_totals),
    };

    Ok(FolderPreview { root, summary })
}

#[async_recursion::async_recursion]
async fn collect_folder_preview_impl(
    abs_dir: &Path,
    root: &Path,
    accumulator: &mut PreviewAccumulator,
) -> Result<FolderPreviewNode> {
    accumulator.total_folders += 1;

    let mut dir = fs::read_dir(abs_dir)
        .await
        .with_context(|| format!("failed to read_dir {:?}", abs_dir))?;

    let mut children = Vec::new();
    let mut local_stats: HashMap<FileType, PreviewFileStats> = HashMap::new();
    let mut total_files = 0_u64;
    let mut total_bytes = 0_u64;

    while let Some(entry) = dir
        .next_entry()
        .await
        .with_context(|| format!("failed to read entry under {:?}", abs_dir))?
    {
        let entry_path = entry.path();

        if check_is_hidden(&entry_path) {
            continue;
        }

        let file_type = entry.file_type().await.with_context(|| {
            format!("failed to get file_type for {:?}", entry_path)
        })?;

        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            let child =
                collect_folder_preview_impl(&entry_path, root, accumulator)
                    .await?;
            children.push(child);
            continue;
        }

        if file_type.is_file() {
            let kind = FileType::from(entry_path.as_path());
            let metadata = entry.metadata().await.with_context(|| {
                format!("failed to get metadata for {:?}", entry_path)
            })?;
            let size = metadata.len();

            total_files += 1;
            total_bytes += size;

            let local_entry = local_stats.entry(kind).or_default();
            local_entry.count += 1;
            local_entry.bytes += size;

            let global_entry =
                accumulator.file_type_totals.entry(kind).or_default();
            global_entry.count += 1;
            global_entry.bytes += size;

            accumulator.total_files += 1;
            accumulator.total_bytes += size;
        }
    }

    let name = abs_dir
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| abs_dir.to_string_lossy().into_owned());

    Ok(FolderPreviewNode {
        name,
        path: abs_dir.to_string_lossy().into_owned(),
        relative_path: relative_path_key(root, abs_dir),
        total_files,
        total_bytes,
        file_stats: stats_map_to_vec(&local_stats),
        children,
    })
}

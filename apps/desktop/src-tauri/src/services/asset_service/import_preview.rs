use std::{collections::HashSet, path::PathBuf};

use anyhow::Result;
use tokio::fs;

use crate::{
    models::asset::{ImportFailure, ImportPreviewResult, ImportRequest},
    utils::media,
};

use super::AssetService;

pub(super) struct ImportPreviewScan {
    pub(super) file_paths: Vec<(String, i64)>,
    pub(super) failed: Vec<ImportFailure>,
}

impl AssetService {
    pub(super) async fn expand_import_file_paths(
        &self,
        file_paths: &[String],
    ) -> ImportPreviewScan {
        let mut seen_file_paths = HashSet::new();
        let mut expanded_file_paths = Vec::new();
        let mut failed = Vec::new();

        for file_path in file_paths {
            let file_path = file_path.trim();
            if file_path.is_empty() {
                continue;
            }

            let source = PathBuf::from(file_path);
            let metadata = match fs::symlink_metadata(&source).await {
                Ok(metadata) => metadata,
                Err(error) => {
                    failed.push(ImportFailure {
                        file_path: file_path.to_string(),
                        error: format!(
                            "Failed to read metadata for {}: {error}",
                            source.display()
                        ),
                    });
                    continue;
                }
            };
            let file_type = metadata.file_type();
            if file_type.is_symlink() {
                continue;
            }

            if metadata.is_file() {
                if media::is_supported_image(&source)
                    && seen_file_paths.insert(file_path.to_string())
                {
                    expanded_file_paths
                        .push((file_path.to_string(), metadata.len() as i64));
                }
                continue;
            }

            if !metadata.is_dir() {
                continue;
            }

            let mut pending_dirs = vec![source];
            while let Some(directory) = pending_dirs.pop() {
                let mut entries = match fs::read_dir(&directory).await {
                    Ok(entries) => entries,
                    Err(error) => {
                        failed.push(ImportFailure {
                            file_path: directory.to_string_lossy().into_owned(),
                            error: format!(
                                "Failed to read directory {}: {error}",
                                directory.display()
                            ),
                        });
                        continue;
                    }
                };

                loop {
                    let entry = match entries.next_entry().await {
                        Ok(Some(entry)) => entry,
                        Ok(None) => break,
                        Err(error) => {
                            // Reading the next entry can fail after the directory is opened.
                            failed.push(ImportFailure {
                                file_path: directory
                                    .to_string_lossy()
                                    .into_owned(),
                                error: format!(
                                    "Failed to read directory {}: {error}",
                                    directory.display()
                                ),
                            });
                            break;
                        }
                    };
                    let path = entry.path();
                    let metadata = match entry.metadata().await {
                        Ok(metadata) => metadata,
                        Err(error) => {
                            failed.push(ImportFailure {
                                file_path: path.to_string_lossy().into_owned(),
                                error: format!(
                                    "Failed to read metadata for {}: {error}",
                                    path.display()
                                ),
                            });
                            continue;
                        }
                    };
                    let file_type = metadata.file_type();
                    if file_type.is_symlink() {
                        continue;
                    }

                    if metadata.is_dir() {
                        pending_dirs.push(path);
                        continue;
                    }

                    if metadata.is_file() && media::is_supported_image(&path) {
                        let path_string = path.to_string_lossy().into_owned();
                        if seen_file_paths.insert(path_string.clone()) {
                            expanded_file_paths
                                .push((path_string, metadata.len() as i64));
                        }
                    }
                }
            }
        }

        ImportPreviewScan { file_paths: expanded_file_paths, failed }
    }

    pub async fn preview_import_images(
        &self,
        request: ImportRequest,
    ) -> Result<ImportPreviewResult> {
        let scan = self.expand_import_file_paths(&request.file_paths).await;
        let total_size =
            scan.file_paths.iter().map(|(_, file_size)| *file_size).sum();
        let file_paths = scan
            .file_paths
            .into_iter()
            .map(|(file_path, _)| file_path)
            .collect::<Vec<_>>();

        Ok(ImportPreviewResult {
            asset_count: file_paths.len(),
            total_size,
            file_paths,
            failed: scan.failed,
        })
    }
}

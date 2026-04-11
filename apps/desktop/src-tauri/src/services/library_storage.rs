use std::path::{Path, PathBuf};

use anyhow::{anyhow, Result};

use crate::{services::media_service, state::LibraryPaths};

#[derive(Clone)]
pub struct LibraryStorage {
    paths: LibraryPaths,
}

impl LibraryStorage {
    pub fn new(paths: LibraryPaths) -> Self {
        Self { paths }
    }

    pub fn target_asset_path(&self, hash: &str, source_path: &Path) -> PathBuf {
        media_service::target_asset_path(
            &self.paths.asset_dir,
            hash,
            source_path,
        )
    }

    pub fn thumbnail_path(&self, hash: &str) -> PathBuf {
        media_service::thumbnail_path(&self.paths.thumb_dir, hash)
    }

    pub fn temp_file(&self, file_name: &str) -> PathBuf {
        self.paths.tmp_dir.join(file_name)
    }

    pub async fn reveal_path(&self, path: &Path) -> Result<()> {
        #[cfg(target_os = "macos")]
        {
            let status = std::process::Command::new("open")
                .arg("-R")
                .arg(path)
                .status()?;
            if !status.success() {
                return Err(anyhow!(
                    "open -R failed for {} with status {status}",
                    path.display()
                ));
            }
            return Ok(());
        }

        #[cfg(target_os = "windows")]
        {
            let status = std::process::Command::new("explorer")
                .arg("/select,")
                .arg(path)
                .status()?;
            if !status.success() {
                return Err(anyhow!(
                    "explorer failed for {} with status {status}",
                    path.display()
                ));
            }
            return Ok(());
        }

        #[cfg(target_os = "linux")]
        {
            let target = path.parent().unwrap_or(path);
            let status =
                std::process::Command::new("xdg-open").arg(target).status()?;
            if !status.success() {
                return Err(anyhow!(
                    "xdg-open failed for {} with status {status}",
                    target.display()
                ));
            }
            return Ok(());
        }

        #[allow(unreachable_code)]
        Ok(())
    }
}

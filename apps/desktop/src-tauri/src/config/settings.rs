use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

/// Default directory name used for workspace downloads.
pub const DEFAULT_DOWNLOAD_DIR_NAME: &str = "download";

/// Workspace-specific settings stored in `.moa/settings.json`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MoaSettings {
    /// Optional override for the workspace download directory.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_dir: Option<String>,
}

impl MoaSettings {
    /// Resolve the effective download directory, falling back to defaults.
    pub fn effective_download_dir<P: AsRef<Path>>(
        &self,
        base_dir: P,
    ) -> PathBuf {
        match &self.download_dir {
            Some(path) => {
                let candidate = PathBuf::from(path);
                if candidate.is_relative() {
                    base_dir.as_ref().join(candidate)
                } else {
                    candidate
                }
            }
            None => base_dir.as_ref().join(DEFAULT_DOWNLOAD_DIR_NAME),
        }
    }

    /// Serialize only user-provided overrides for storage.
    pub fn to_overrides(&self) -> Value {
        let defaults = Self::default();
        let mut map = Map::new();

        if self.download_dir != defaults.download_dir {
            if let Some(dir) = &self.download_dir {
                map.insert(
                    "downloadDir".into(),
                    serde_json::Value::String(dir.clone()),
                );
            }
        }

        serde_json::Value::Object(map)
    }
}

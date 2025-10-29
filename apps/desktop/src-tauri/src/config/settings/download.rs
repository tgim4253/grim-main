use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

/// Default directory name used for workspace downloads.
pub const DEFAULT_DOWNLOAD_DIR_NAME: &str = "download";

/// Download-related workspace settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct DownloadSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dir: Option<String>,
}

impl DownloadSettings {
    pub const fn is_default(&self) -> bool {
        self.dir.is_none()
    }

    pub fn effective_dir<P: AsRef<Path>>(&self, base_dir: P) -> PathBuf {
        match &self.dir {
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

    pub fn to_overrides(&self) -> Value {
        let mut map = Map::new();

        if let Some(dir) = &self.dir {
            map.insert("dir".into(), serde_json::Value::String(dir.clone()));
        }

        serde_json::Value::Object(map)
    }
}

mod download;
mod graph;

use serde::{de::Deserializer, Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

pub use download::DownloadSettings;
pub use graph::{
    ConnectionRule, ConnectionRuleAction, ConnectionRuleMatch, GraphSettings,
};

/// Workspace-specific settings stored in `.moa/settings.json`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct MoaSettings {
    /// Download settings grouped under their own namespace.
    #[serde(
        skip_serializing_if = "DownloadSettings::is_default",
        deserialize_with = "deserialize_download",
        alias = "downloadDir"
    )]
    pub download: DownloadSettings,

    /// Graph-related configuration.
    #[serde(skip_serializing_if = "GraphSettings::is_default")]
    pub graph: GraphSettings,
}

impl MoaSettings {
    /// Resolve the effective download directory, falling back to defaults.
    pub fn effective_download_dir<P: AsRef<Path>>(
        &self,
        base_dir: P,
    ) -> PathBuf {
        self.download.effective_dir(base_dir)
    }

    /// Serialize only user-provided overrides for storage.
    pub fn to_overrides(&self) -> Value {
        let defaults = Self::default();
        let mut map = Map::new();

        if self.download != defaults.download {
            map.insert("download".into(), self.download.to_overrides());
        }

        if self.graph != defaults.graph {
            map.insert("graph".into(), self.graph.to_overrides());
        }

        serde_json::Value::Object(map)
    }
}

fn deserialize_download<'de, D>(
    deserializer: D,
) -> Result<DownloadSettings, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum DownloadField {
        Settings(DownloadSettings),
        Dir(String),
        Optional(Option<String>),
    }

    let helper = Option::<DownloadField>::deserialize(deserializer)?;

    Ok(match helper {
        None => DownloadSettings::default(),
        Some(DownloadField::Settings(settings)) => settings,
        Some(DownloadField::Dir(dir)) => DownloadSettings { dir: Some(dir) },
        Some(DownloadField::Optional(dir)) => DownloadSettings { dir },
    })
}

use serde::{Deserialize, Serialize};

/// Persisted metadata describing a Moa workspace selection.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct Moa {
    /// Display name for the workspace.
    pub name: String,
    /// Base filesystem path that contains the workspace.
    pub path: String,

    #[serde(default)]
    /// Stable identifier for the workspace.
    pub moa_id: String,
    #[serde(default)]
    /// Timestamp of the last time the workspace was opened.
    pub last_opened_at: Option<i64>,
}

/// On-disk configuration persisted within the `.moa` folder.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MoaConfig {
    /// Application name stored in the config payload.
    pub app: String,
    /// Whether this is the first run for the workspace.
    pub first: bool,
    /// Creation timestamp for the workspace configuration.
    pub created_at: String,
    /// Database schema version stored alongside the workspace.
    pub database_version: i32,
}

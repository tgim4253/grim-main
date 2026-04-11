use serde::{Deserialize, Serialize};

use crate::models::croquis::CroquisPreferences;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySettings {
    #[serde(default)]
    pub active_session_preset_id: Option<String>,
    #[serde(default)]
    pub croquis_preferences: Option<CroquisPreferences>,
}

use serde::{Deserialize, Serialize};

use super::graph_settings::GraphPreferences;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GridPreferences {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PanelPreferences {
    #[serde(default)]
    pub graph: GraphPreferences,
    #[serde(default)]
    pub grid: Option<GridPreferences>,
    #[serde(default)]
    pub active_view: Option<String>,
    #[serde(default)]
    pub root_node_id: Option<String>,
}

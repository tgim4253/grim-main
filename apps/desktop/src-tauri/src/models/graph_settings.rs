use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::connection::RelationType;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GraphFilter<T> {
    #[serde(default)]
    pub include: Vec<T>,
    #[serde(default)]
    pub exclude: Vec<T>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphOption {
    #[serde(default)]
    pub visible_levels: Vec<i32>,
    #[serde(default)]
    pub per_kind_levels: HashMap<String, Vec<i32>>,
    #[serde(default)]
    pub max_depth: Option<i32>,
    #[serde(default)]
    pub hide_level_two_nodes: bool,
    #[serde(default)]
    pub connection_kinds: GraphFilter<RelationType>,
    #[serde(default)]
    pub node_kinds: GraphFilter<String>,
    #[serde(default)]
    pub clauses: Vec<GraphClause>,
}

impl Default for GraphOption {
    fn default() -> Self {
        Self {
            visible_levels: Vec::new(),
            per_kind_levels: HashMap::new(),
            max_depth: None,
            hide_level_two_nodes: false,
            connection_kinds: GraphFilter::default(),
            node_kinds: GraphFilter::default(),
            clauses: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphPreset {
    pub id: String,
    pub name: String,
    pub option: GraphOption,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GraphPreferences {
    #[serde(default)]
    pub presets: Vec<GraphPreset>,
    #[serde(default)]
    pub active_preset_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GraphClause {
    LinkedToNode { node_id: String, include: bool },
    LinkedViaKind { relation_kind: RelationType, include: bool },
    LinkedViaNodeKind { node_kind: String, include: bool },
}

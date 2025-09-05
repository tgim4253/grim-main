use serde::{Deserialize, Serialize};
use sqlx::{prelude::Type, FromRow};

#[derive(Debug, FromRow, Serialize)]
pub struct Connection {
    pub id: String,
    pub src_node_id: String,
    pub dst_node_id: String,
    pub kind_rule_id: String,
    pub kind: String,
    pub level: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "TEXT")]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum RelationType {
    ContainsFile,
    BelongToFolder,
    ParentFolder,
    ChildFolder,
}

///
/// EdgeType defines how edges are treated during graph traversal.
/// - Forward: traversal continues
/// - Reverse: traversal stops (edge ignored)
/// - Bidirectional: traversal continues but may be hidden later in UI
///
pub enum EdgeType {
    Forward = 1,       // Normal forward edge, expand during traversal
    Bidirectional = 2, // Expand during traversal, but can be hidden in UI
    Reverse = 3,       // Do not expand, stop traversal at this edge
}

pub struct ConnectionKind {
    pub kind_rule_id: String,
    pub kind: RelationType,
    pub default_level: EdgeType,
    pub editable: bool,
    pub description: Option<String>,
}

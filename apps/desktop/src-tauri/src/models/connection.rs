use serde::Serialize;
use sqlx::FromRow;

#[derive(Debug, FromRow, Serialize)]
pub struct Connection {
    pub id: String,
    pub src_node_id: String,
    pub dst_node_id: String,
    pub kind_rule_id: String,
    pub kind: String,
    pub weight: i64,
}

pub struct ConnectionKind {
    pub kind_rule_id: String,
    pub kind: String,
    pub default_weight: i64,
    pub editable: bool,
    pub description: Option<String>,
}

use serde::Serialize;

use crate::models::{connection::Connection, node::Node};

#[derive(Debug, Serialize)]
pub struct GraphResponse {
    pub root_node_id: Option<String>,
    pub nodes: Vec<Node>,
    pub connections: Vec<Connection>,
}

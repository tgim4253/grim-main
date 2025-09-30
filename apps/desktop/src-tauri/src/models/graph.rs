use serde::{Deserialize, Serialize};

use crate::models::{connection::Connection, node::Node};

/// Graph response returned to the renderer.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GraphResponse {
    pub root_node_id: String,
    pub nodes: Vec<Node>,
    pub connections: Vec<Connection>,
}

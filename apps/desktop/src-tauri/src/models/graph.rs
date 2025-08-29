use crate::models::{connection::Connection, node::Node};

pub struct GraphResponse {
    pub root_node_id: Option<String>,
    pub nodes: Vec<Node>,
    pub connections: Vec<Connection>,
}

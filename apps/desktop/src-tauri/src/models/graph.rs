use crate::models::{connection::Connection, node::Node};

pub struct GraphResponse {
    root_node_id: Option<String>,
    nodes: Vec<Node>,
    connections: Vec<Connection>,
}

use crate::models::graph::GraphResponse;

pub async fn fectch_graph_one(moa_id: String, node_id: String) -> GraphResponse {
    GraphResponse { nodes: vec![], connections: vec![], root_node_id: None }
}

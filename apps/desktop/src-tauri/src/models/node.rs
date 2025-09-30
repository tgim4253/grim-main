use std::str::FromStr;

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Type};

use crate::models::{
    connection::Connection,
    crop::ImageCrop,
    file::{FileContent, NodeFolder},
    memo::NodeMemo,
};

/// Kind of node stored in the workspace graph.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Type,
    Hash,
    Default,
)]
#[sqlx(type_name = "TEXT")] // SQLite TEXT
#[sqlx(rename_all = "lowercase")] // Folder → "folder"
#[serde(rename_all = "lowercase")] // JSON 직렬화용(선택)
pub enum NodeKind {
    Folder,
    File,
    Tag,
    Annotation,
    Memo,
    Crop,
    #[default]
    Unknown,
}

impl FromStr for NodeKind {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "folder" => Ok(NodeKind::Folder),
            "file" => Ok(NodeKind::File),
            "memo" => Ok(NodeKind::Memo),
            "crop" => Ok(NodeKind::Crop),
            _ => Ok(NodeKind::Unknown),
        }
    }
}

/// Node record returned to the renderer.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    pub data: Option<NodeData>,
    pub created_at: String,
    pub updated_at: String,
}

/// Associated data for a node depending on its kind.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum NodeData {
    Folder(NodeFolder),
    File(FileContent),
    Crop(ImageCrop),
    Memo(NodeMemo),
}

/// Wrapper bundling nodes and their connections.
#[derive(Debug, FromRow, Serialize)]
pub struct NodeWithConnections {
    pub nodes: Vec<Node>,
    pub connections: Vec<Connection>,
}

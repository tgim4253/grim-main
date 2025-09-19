use std::convert::TryFrom;
use std::str::FromStr;

use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Type};

use crate::models::{
    connection::Connection,
    file::{FileContent, NodeFolder},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, Hash, Default)]
#[sqlx(type_name = "TEXT")] // SQLite TEXT
#[sqlx(rename_all = "lowercase")] // Folder → "folder"
#[serde(rename_all = "lowercase")] // JSON 직렬화용(선택)
pub enum NodeKind {
    Folder,
    File,
    Tag,
    Annotation,
    Memo,
    #[default]
    Unknown,
}

impl FromStr for NodeKind {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "folder" => Ok(NodeKind::Folder),
            "file" => Ok(NodeKind::File),
            _ => Ok(NodeKind::Unknown),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    pub data: Option<NodeData>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum NodeData {
    Folder(NodeFolder),
    File(FileContent),
}

#[derive(Debug, FromRow, Serialize)]
pub struct NodeWithConnections {
    pub nodes: Vec<Node>,
    pub connections: Vec<Connection>,
}

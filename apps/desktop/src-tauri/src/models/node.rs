use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteRow, FromRow, Row, Type};

use crate::models::{
    connection::Connection,
    file::{FileContent, NodeFolder},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "TEXT")] // SQLite TEXT
#[sqlx(rename_all = "lowercase")] // Folder → "folder"
#[serde(rename_all = "lowercase")] // JSON 직렬화용(선택)
pub enum NodeKind {
    Folder,
    File,
    Tag,
    Annotation,
    Memo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    pub data: NodeData,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum NodeData {
    Folder(NodeFolder),
    File(FileContent),
}

#[derive(Debug)]
pub struct NodeRow<T> {
    // node
    pub node_id: String,
    pub kind: NodeKind,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,

    // data
    pub data: T,
}

impl<'r, T> FromRow<'r, SqliteRow> for NodeRow<T>
where
    T: FromRow<'r, SqliteRow>,
{
    fn from_row(row: &'r SqliteRow) -> Result<Self, sqlx::Error> {
        Ok(Self {
            node_id: row.try_get("node_id")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
            kind: row.try_get("kind")?,
            data: T::from_row(row)?,
        })
    }
}

#[derive(Debug, FromRow, Serialize)]
pub struct NodeWithConnections {
    pub nodes: Vec<Node>,
    pub connections: Vec<Connection>,
}

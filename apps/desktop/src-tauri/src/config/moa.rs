use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct Moa {
    pub name: String,
    pub path: String,

    #[serde(default)]
    pub moa_id: String,
    #[serde(default)]
    pub last_opened_at: Option<i64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MoaConfig {
    pub app: String,
    pub first: bool,
    pub created_at: String,
    pub database_version: i32,
}

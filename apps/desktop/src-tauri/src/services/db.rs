use crate::{
    bootstrap::PATH_MANAGER,
    models::{
        file::NodeFolder,
        node::{Node, NodeData, NodeKind},
    },
    services::integrity,
    utils::identifier::get_unique_id,
};
use anyhow::Result;
use once_cell::sync::Lazy;
use sqlx::{Executor, Pool, Sqlite, Transaction};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

pub struct DbManager {
    pools: RwLock<HashMap<String, Arc<Pool<Sqlite>>>>, // key = moa_id
}
pub static DB_MANAGER: Lazy<Arc<DbManager>> = Lazy::new(|| Arc::new(DbManager::new()));
impl DbManager {
    pub fn new() -> Self {
        Self { pools: RwLock::new(HashMap::new()) }
    }

    pub async fn get_or_open(&self, moa_id: &str) -> anyhow::Result<Arc<Pool<Sqlite>>> {
        {
            let pools = self.pools.read().await;
            if let Some(pool) = pools.get(moa_id) {
                return Ok(pool.clone());
            }
        }

        let mut pools = self.pools.write().await;
        if let Some(pool) = pools.get(moa_id) {
            return Ok(pool.clone());
        }

        let path = PATH_MANAGER.get_or_add(moa_id).await?.db_path;
        let pool = Arc::new(integrity::open_or_create_db(&path).await?);
        pools.insert(moa_id.to_string(), pool.clone());

        Ok(pool)
    }

    pub async fn create_new_tx(&self, moa_id: &str) -> anyhow::Result<Transaction<'_, Sqlite>> {
        let pool = self.get_or_open(moa_id).await?;
        Ok(pool.begin().await?)
    }
}

use crate::{bootstrap::PATH_MANAGER, services::integrity};
use once_cell::sync::Lazy;
use sqlx::{Pool, Sqlite, Transaction};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::RwLock;

/// Coordinates connection pools for each Moa workspace database.
pub struct DbManager {
    /// Connection pools keyed by workspace identifier.
    pools: RwLock<HashMap<String, Arc<Pool<Sqlite>>>>,
}

/// Global database manager instance used throughout the backend services.
pub static DB_MANAGER: Lazy<Arc<DbManager>> =
    Lazy::new(|| Arc::new(DbManager::new()));
impl DbManager {
    /// Create a manager with no cached pools.
    pub fn new() -> Self {
        Self { pools: RwLock::new(HashMap::new()) }
    }

    /// Retrieve an existing pool for the given Moa id or open a new one.
    pub async fn get_or_open(
        &self,
        moa_id: &str,
    ) -> anyhow::Result<Arc<Pool<Sqlite>>> {
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

    /// Start a new SQL transaction for the provided workspace.
    pub async fn create_new_tx(
        &self,
        moa_id: &str,
    ) -> anyhow::Result<Transaction<'_, Sqlite>> {
        let pool = self.get_or_open(moa_id).await?;
        Ok(pool.begin().await?)
    }
}

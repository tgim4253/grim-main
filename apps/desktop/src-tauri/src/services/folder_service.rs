use anyhow::Result;

use crate::{
    models::{
        folder::{
            DeleteVirtualFolderPayload, SaveVirtualFolderPayload,
            SaveVirtualFolderResult, VirtualFolder,
        },
        library::FolderStats,
    },
    repositories::FolderRepository,
};

#[derive(Clone)]
pub struct FolderService {
    folder_repository: FolderRepository,
}

impl FolderService {
    pub fn new(folder_repository: FolderRepository) -> Self {
        Self { folder_repository }
    }

    pub async fn load_virtual_folders(&self) -> Result<Vec<VirtualFolder>> {
        self.folder_repository.load_all().await
    }

    pub async fn load_folder_stats(&self) -> Result<Vec<FolderStats>> {
        self.folder_repository.load_stats().await
    }

    pub async fn search_virtual_folders(
        &self,
        query: &str,
    ) -> Result<Vec<VirtualFolder>> {
        self.folder_repository.search(query).await
    }

    pub async fn save_virtual_folder(
        &self,
        payload: SaveVirtualFolderPayload,
    ) -> Result<SaveVirtualFolderResult> {
        let saved_folder_id = self.folder_repository.save(payload).await?;
        let folders = self.folder_repository.load_all().await?;
        Ok(SaveVirtualFolderResult { saved_folder_id, folders })
    }

    pub async fn delete_virtual_folder(
        &self,
        payload: DeleteVirtualFolderPayload,
    ) -> Result<Vec<VirtualFolder>> {
        self.folder_repository.delete(&payload.folder_id).await?;
        self.folder_repository.load_all().await
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::{
        models::folder::{
            SaveVirtualFolderPayload, VirtualFolderKind,
            SYSTEM_UNCATEGORIZED_FOLDER_NAME,
        },
        repositories::FolderRepository,
        state::bootstrap::{ensure_schema, open_or_create_db},
    };

    use super::FolderService;

    fn make_temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "grim-folder-service-{prefix}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("failed to create temp dir");
        dir
    }

    #[tokio::test]
    async fn child_creation_moves_parent_assets_to_system_uncategorized() {
        let dir = make_temp_dir("leaf-policy");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");

        let service = FolderService::new(FolderRepository::new(pool.clone()));
        let root = service
            .save_virtual_folder(SaveVirtualFolderPayload {
                id: None,
                name: "Anatomy".to_string(),
                parent_id: None,
                alias: None,
            })
            .await
            .expect("failed to save root folder");

        let asset_id = "asset-1";
        let root_folder_id = root.saved_folder_id;
        sqlx::query!(
            r#"
            INSERT INTO asset
            (id, hash, file_name, file_size, mime_type, width, height, modified_at, created_at, updated_at)
            VALUES (?1, 'hash-1', 'asset.png', 1, 'image/png', 1, 1, NULL, 'now', 'now')
            "#,
            asset_id
        )
        .execute(&pool)
        .await
        .expect("failed to insert asset");
        let root_folder_id_ref = root_folder_id.as_str();
        sqlx::query!(
            r#"
            INSERT INTO asset_virtual_folder
            (asset_id, virtual_folder_id, source_type, created_at)
            VALUES (?1, ?2, 'manual', 'now')
            "#,
            asset_id,
            root_folder_id_ref
        )
        .execute(&pool)
        .await
        .expect("failed to assign asset");

        service
            .save_virtual_folder(SaveVirtualFolderPayload {
                id: None,
                name: "Musculature".to_string(),
                parent_id: Some(root_folder_id.clone()),
                alias: None,
            })
            .await
            .expect("failed to save child folder");

        let folders = service
            .load_virtual_folders()
            .await
            .expect("failed to reload folders");
        let system_folder = folders
            .iter()
            .find(|folder| {
                folder.parent_id.as_deref() == Some(root_folder_id.as_str())
                    && folder.kind == VirtualFolderKind::SystemUncategorized
            })
            .expect("expected system uncategorized child");
        assert_eq!(system_folder.name, SYSTEM_UNCATEGORIZED_FOLDER_NAME);

        let row = sqlx::query!(
            r#"
            SELECT virtual_folder_id
            FROM asset_virtual_folder
            WHERE asset_id = ?1
            "#,
            asset_id
        )
        .fetch_one(&pool)
        .await
        .expect("failed to load assignment");
        assert_eq!(row.virtual_folder_id, system_folder.id);

        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn descendant_asset_count_deduplicates_assets() {
        let dir = make_temp_dir("dedupe-descendants");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");

        let service = FolderService::new(FolderRepository::new(pool.clone()));
        let parent = service
            .save_virtual_folder(SaveVirtualFolderPayload {
                id: None,
                name: "Anatomy".to_string(),
                parent_id: None,
                alias: None,
            })
            .await
            .expect("failed to save parent folder");
        let first_child = service
            .save_virtual_folder(SaveVirtualFolderPayload {
                id: None,
                name: "Musculature".to_string(),
                parent_id: Some(parent.saved_folder_id.clone()),
                alias: None,
            })
            .await
            .expect("failed to save first child folder");
        let second_child = service
            .save_virtual_folder(SaveVirtualFolderPayload {
                id: None,
                name: "Bones".to_string(),
                parent_id: Some(parent.saved_folder_id.clone()),
                alias: None,
            })
            .await
            .expect("failed to save second child folder");

        let asset_id = "asset-1";
        sqlx::query!(
            r#"
            INSERT INTO asset
            (id, hash, file_name, file_size, mime_type, width, height, modified_at, created_at, updated_at)
            VALUES (?1, 'hash-1', 'asset.png', 1, 'image/png', 1, 1, NULL, 'now', 'now')
            "#,
            asset_id
        )
        .execute(&pool)
        .await
        .expect("failed to insert asset");

        for folder_id in [
            first_child.saved_folder_id.as_str(),
            second_child.saved_folder_id.as_str(),
        ] {
            sqlx::query!(
                r#"
                INSERT INTO asset_virtual_folder
                (asset_id, virtual_folder_id, source_type, created_at)
                VALUES (?1, ?2, 'manual', 'now')
                "#,
                asset_id,
                folder_id
            )
            .execute(&pool)
            .await
            .expect("failed to assign asset");
        }

        let stats = service
            .load_folder_stats()
            .await
            .expect("failed to load folder stats");
        let parent_stats = stats
            .iter()
            .find(|stats| stats.folder_id == parent.saved_folder_id)
            .expect("missing parent stats");

        assert_eq!(parent_stats.direct_asset_count, 0);
        assert_eq!(parent_stats.descendant_asset_count, 1);
        assert_eq!(parent_stats.child_count, 2);

        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn deleting_last_user_child_removes_empty_system_child() {
        let dir = make_temp_dir("leaf-revert");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");

        let service = FolderService::new(FolderRepository::new(pool.clone()));
        let parent = service
            .save_virtual_folder(SaveVirtualFolderPayload {
                id: None,
                name: "Anatomy".to_string(),
                parent_id: None,
                alias: None,
            })
            .await
            .expect("failed to save parent folder");
        let child = service
            .save_virtual_folder(SaveVirtualFolderPayload {
                id: None,
                name: "Musculature".to_string(),
                parent_id: Some(parent.saved_folder_id.clone()),
                alias: None,
            })
            .await
            .expect("failed to save child folder");

        service
            .delete_virtual_folder(
                crate::models::folder::DeleteVirtualFolderPayload {
                    folder_id: child.saved_folder_id,
                },
            )
            .await
            .expect("failed to delete child folder");

        let folders = service
            .load_virtual_folders()
            .await
            .expect("failed to reload folders");
        assert!(!folders.iter().any(|folder| {
            folder.parent_id.as_deref() == Some(parent.saved_folder_id.as_str())
                && folder.kind == VirtualFolderKind::SystemUncategorized
        }));

        let child_count = FolderRepository::new(pool.clone())
            .child_count(&parent.saved_folder_id)
            .await
            .expect("failed to count children");
        assert_eq!(child_count, 0);

        service
            .delete_virtual_folder(
                crate::models::folder::DeleteVirtualFolderPayload {
                    folder_id: parent.saved_folder_id,
                },
            )
            .await
            .expect("failed to delete reverted leaf parent");

        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn uncategorized_user_folder_name_is_only_reserved_under_parent() {
        let dir = make_temp_dir("uncategorized-name");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");

        let service = FolderService::new(FolderRepository::new(pool));
        let root_uncategorized = service
            .save_virtual_folder(SaveVirtualFolderPayload {
                id: None,
                name: SYSTEM_UNCATEGORIZED_FOLDER_NAME.to_string(),
                parent_id: None,
                alias: None,
            })
            .await;
        assert!(root_uncategorized.is_ok());

        let parent = service
            .save_virtual_folder(SaveVirtualFolderPayload {
                id: None,
                name: "Anatomy".to_string(),
                parent_id: None,
                alias: None,
            })
            .await
            .expect("failed to save parent folder");
        let child_uncategorized = service
            .save_virtual_folder(SaveVirtualFolderPayload {
                id: None,
                name: SYSTEM_UNCATEGORIZED_FOLDER_NAME.to_string(),
                parent_id: Some(parent.saved_folder_id),
                alias: None,
            })
            .await;
        assert!(child_uncategorized.is_err());

        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn stale_update_does_not_apply_parent_policy_side_effects() {
        let dir = make_temp_dir("stale-update");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");

        let service = FolderService::new(FolderRepository::new(pool.clone()));
        let parent = service
            .save_virtual_folder(SaveVirtualFolderPayload {
                id: None,
                name: "Anatomy".to_string(),
                parent_id: None,
                alias: None,
            })
            .await
            .expect("failed to save parent folder");

        let asset_id = "asset-1";
        sqlx::query!(
            r#"
            INSERT INTO asset
            (id, hash, file_name, file_size, mime_type, width, height, modified_at, created_at, updated_at)
            VALUES (?1, 'hash-1', 'asset.png', 1, 'image/png', 1, 1, NULL, 'now', 'now')
            "#,
            asset_id
        )
        .execute(&pool)
        .await
        .expect("failed to insert asset");
        let parent_folder_id = parent.saved_folder_id.as_str();
        sqlx::query!(
            r#"
            INSERT INTO asset_virtual_folder
            (asset_id, virtual_folder_id, source_type, created_at)
            VALUES (?1, ?2, 'manual', 'now')
            "#,
            asset_id,
            parent_folder_id
        )
        .execute(&pool)
        .await
        .expect("failed to assign asset");

        let result = service
            .save_virtual_folder(SaveVirtualFolderPayload {
                id: Some("missing-folder".to_string()),
                name: "Musculature".to_string(),
                parent_id: Some(parent.saved_folder_id.clone()),
                alias: None,
            })
            .await;
        assert!(result.is_err());

        let folders = service
            .load_virtual_folders()
            .await
            .expect("failed to reload folders");
        assert!(!folders.iter().any(|folder| {
            folder.parent_id.as_deref() == Some(parent.saved_folder_id.as_str())
                && folder.kind == VirtualFolderKind::SystemUncategorized
        }));

        let row = sqlx::query!(
            r#"
            SELECT virtual_folder_id
            FROM asset_virtual_folder
            WHERE asset_id = ?1
            "#,
            asset_id
        )
        .fetch_one(&pool)
        .await
        .expect("failed to load assignment");
        assert_eq!(row.virtual_folder_id, parent.saved_folder_id);

        let _ = fs::remove_dir_all(dir);
    }
}

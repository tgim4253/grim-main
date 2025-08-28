use std::{
    collections::HashSet,
    fs::{self, DirEntry, File},
    hash::Hasher,
    io::{self, BufReader, Read},
    path::{self, Path, PathBuf},
    pin::Pin,
};

use anyhow::{anyhow, bail, Context, Result};
use async_recursion::async_recursion;
use sha2::{Digest, Sha256};
use sqlx::{Sqlite, SqlitePool, Transaction};
use twox_hash::XxHash64;

use crate::{
    app_launcher::moa,
    models::{
        file::{FileInfo, FileType, FolderData, StorageRootInfo},
        node::Node,
    },
    services::{
        db::{
            self, create_file_node, create_file_path, create_virtual_folder_mount,
            ensure_real_folder, ensure_storage_root_and_real_folder, DB_MANAGER,
        },
        storage_root,
    },
    utils::{date::get_now_date, path_utils::normalize_path},
};

pub async fn create_folder(moa_id: String, data: FolderData) -> Result<Node> {
    let mut tx: Transaction<'_, Sqlite> = DB_MANAGER.create_new_tx(&moa_id).await?;

    let node = db::create_virtual_folder(tx.as_mut(), data.name, data.parent_id).await?;

    tx.commit().await?;

    Ok(node)
}

pub async fn first_mount_folder(moa_id: String, node: Node, path: String) -> Result<()> {
    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let norm_path = crate::utils::path_utils::normalize_path(&path);

    // storage root
    let sroot_info = storage_root::detect_storage_root(&norm_path)?;

    let real_folder_id =
        ensure_storage_root_and_real_folder(tx.as_mut(), &sroot_info, &norm_path).await?;

    let mount_id =
        create_virtual_folder_mount(tx.as_mut(), node.id.clone(), real_folder_id.clone()).await?;

    upsert_folder(&mut tx, real_folder_id.clone(), node.id, &norm_path, true, Some(true)).await?;

    let scan_id = start_scan_job(moa_id.clone(), real_folder_id).await?;

    tx.commit().await?;

    Ok(())
}

pub async fn start_scan_job(moa_id: String, real_folder_id: String) -> Result<String> {
    Ok("".to_string())
}

// Scan Folder and Upser file and folder content
/// make_virtaul_folder: when reculrsive is false,
///                      if make_virtual_folder is true, create virtual folder for each sub folder
///                      if make_virtual_folder is false, not create virtual folder.
// TODO: Currently everything is in a single transaction.
//       Consider splitting mounts and file upserts into separate transactions
//       if performance or long-running locks become an issue.
#[async_recursion]
async fn upsert_folder(
    tx: &mut Transaction<'_, Sqlite>,
    parent_real_folder_id: String,
    parent_virtual_folder_id: String,
    abs_dir: &Path,
    recursive: bool,
    make_virtual_folder: Option<bool>,
) -> Result<()> {
    let make_vf = make_virtual_folder.unwrap_or(true);

    // Use async directory reading to avoid blocking the runtime
    let mut dir = tokio::fs::read_dir(abs_dir)
        .await
        .with_context(|| format!("failed to read_dir {:?}", abs_dir))?;

    let mut folder_entries: Vec<(PathBuf, String)> = Vec::new();
    while let Some(entry) = dir
        .next_entry()
        .await
        .with_context(|| format!("failed to read entry under {:?}", abs_dir))?
    {
        let entry_path: PathBuf = entry.path();

        // check file is hidden
        if check_is_hidden(&entry_path) {
            continue;
        };

        let file_type = entry
            .file_type()
            .await
            .with_context(|| format!("failed to get file_type for {:?}", entry_path))?;
        // Avoid symlink loops (temp)
        if file_type.is_symlink() {
            continue;
        }

        if file_type.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();

            if recursive {
                folder_entries.push((entry_path, name));
            } else if make_vf {
                // Only create virtual folders for direct child directories, do not mount.
                db::create_virtual_folder(tx.as_mut(), name, parent_virtual_folder_id.clone())
                    .await
                    .with_context(|| {
                        format!("create_virtual_folder failed for {:?}", entry_path)
                    })?;
            }
        } else if file_type.is_file() {
            upsert_file_entry(tx, &parent_real_folder_id, &parent_virtual_folder_id, &entry)
                .await
                .map_err(|e| anyhow!("upsert_file_entry failed for {:?} {}", entry_path, e))?;
        } else {
            continue;
        }
    }
    //  ensure child real folder exists for this path
    let sroot_id: String = sqlx::query_scalar(
        "SELECT storage_root_id FROM real_folder
                     WHERE id = ?",
    )
    .bind(&parent_real_folder_id)
    .fetch_optional(tx.as_mut())
    .await
    .with_context(|| "failed to load storage_root for parent_real_folder_id")?
    .ok_or_else(|| anyhow!("parent_real_folder_id not found: {}", parent_real_folder_id))?;
    if recursive {
        for (entry_path, name) in folder_entries {
            // create child virtual folder node under the parent virtual folder
            let child_vf = db::create_virtual_folder(
                tx.as_mut(),
                name.clone(),
                parent_virtual_folder_id.clone(),
            )
            .await
            .with_context(|| format!("create_virtual_folder failed for {:?}", entry_path))?;

            // normalize child path
            let normalized = normalize_path(&entry_path);

            let child_real_folder_id =
                ensure_real_folder(tx.as_mut(), sroot_id.clone(), &normalized).await?;

            // mount child vf <-> child real folder
            db::create_virtual_folder_mount(
                tx.as_mut(),
                child_vf.id.clone(),
                child_real_folder_id.clone(),
            )
            .await
            .with_context(|| format!("mount vf<->rf failed for {:?}", entry_path))?;

            // recurse into the child directory
            if let Err(e) = upsert_folder(
                tx,
                child_real_folder_id,
                child_vf.id,
                &entry_path,
                recursive,
                Some(make_vf),
            )
            .await
            {
                println!("{}", e);
            };
        }
    };

    Ok(())
}

async fn upsert_file_entry(
    tx: &mut Transaction<'_, Sqlite>,
    parent_real_folder_id: &str,
    parent_virtual_folder_id: &str,
    entry: &tokio::fs::DirEntry,
) -> Result<()> {
    let file_name = entry.file_name().to_string_lossy().to_string();

    let file_path = entry.path();
    let file_info: FileInfo =
        FileInfo::new(&file_path, parent_real_folder_id.to_string(), file_name).await?;

    let file_path_id = create_file_path(tx.as_mut(), &file_info).await?;

    // upsert file_content
    let file_content_id = db::resolve_and_upsert_file_content(tx.as_mut(), &file_info).await?;

    create_file_node(tx.as_mut(), parent_virtual_folder_id, &file_content_id).await?;
    // binding
    db::bind_file_content_to_file_path(tx.as_mut(), &file_path_id, &file_content_id).await?;

    Ok(())
}

#[cfg(unix)]
pub fn check_is_hidden(path: &Path) -> bool {
    if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
        name.starts_with('.')
    } else {
        false
    }
}

#[cfg(windows)]
pub fn check_is_hidden(path: &Path) -> bool {
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::fileapi::GetFileAttributesW;
    use winapi::um::winnt::FILE_ATTRIBUTE_HIDDEN;

    let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
    unsafe {
        let attrs = GetFileAttributesW(wide.as_ptr());
        if attrs == u32::MAX {
            return false; // invalid path or error
        }
        (attrs & FILE_ATTRIBUTE_HIDDEN) != 0
    }
}

// -- hash --

// sha256
fn sha256_of(path: &Path) -> Result<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();

    io::copy(&mut reader, &mut hasher)?;
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn sha256_of_img(path: &Path) -> Result<String> {
    if !matches!(FileType::from(path), FileType::Image) {
        bail!("Not an image file: {}", path.display());
    }
    FileType::check_is_img(path)?;

    sha256_of(path)
}

// xxhash

pub fn xxh3_64_of(path: &Path) -> Result<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = XxHash64::default();

    let mut buffer = [0u8; 8192]; // 8KB 버퍼
    loop {
        let n = reader.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.write(&buffer[..n]);
    }

    Ok(format!("{:016x}", hasher.finish()))
}

pub fn xxh3_644_of_img(path: &Path) -> Result<String> {
    if !matches!(FileType::from(path), FileType::Image) {
        bail!("Not an image file: {}", path.display());
    }
    FileType::check_is_img(path)?;
    xxh3_64_of(path)
}

use std::{
    fs::File,
    hash::Hasher,
    io::{self, BufReader, Read},
    path::{Path, PathBuf},
};

use anyhow::{anyhow, bail, Context, Result};
use async_recursion::async_recursion;
use sha2::{Digest, Sha256};
use sqlx::{Sqlite, Transaction};
use twox_hash::XxHash64;

use crate::{
    db::repository::{
        file_repository::FileRepository, node_repository::NodeRepository,
        sroot_repository::SrootRepository,
    },
    models::{
        file::{FileInfo, FileType, FolderData, RealFolderData},
        node::Node,
    },
    services::{
        db::DB_MANAGER,
        storage_root::{self, ensure_storage_root_and_real_folder},
    },
    utils::{file_utils::file_mtime_epoch, path_utils::normalize_path},
};

pub async fn create_folder(moa_id: String, data: FolderData) -> Result<Node> {
    let mut tx: Transaction<'_, Sqlite> = DB_MANAGER.create_new_tx(&moa_id).await?;

    let node =
        FileRepository::create_virtual_folder(tx.as_mut(), data.name, data.parent_id).await?;

    tx.commit().await?;

    Ok(node)
}

pub async fn first_mount_folder(moa_id: String, node: Node, path: String) -> Result<()> {
    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let norm_path = crate::utils::path_utils::normalize_path(&path);

    // storage root
    let sroot_info = storage_root::detect_storage_root(&norm_path)?;

    let real_folder_id =
        ensure_storage_root_and_real_folder(&mut tx, &sroot_info, &norm_path).await?;

    let _mount_id = FileRepository::create_virtual_folder_mount(
        tx.as_mut(),
        node.id.clone(),
        real_folder_id.clone(),
    )
    .await?;

    upsert_folder(&mut tx, real_folder_id.clone(), node.id, &norm_path, true, Some(true)).await?;

    let _scan_id = start_scan_job(moa_id.clone(), real_folder_id).await?;

    tx.commit().await?;

    Ok(())
}

pub async fn start_scan_job(_moa_id: String, _real_folder_id: String) -> Result<String> {
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
                FileRepository::create_virtual_folder(
                    tx.as_mut(),
                    name,
                    parent_virtual_folder_id.clone(),
                )
                .await
                .with_context(|| format!("create_virtual_folder failed for {:?}", entry_path))?;
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
            let child_vf = FileRepository::create_virtual_folder(
                tx.as_mut(),
                name.clone(),
                parent_virtual_folder_id.clone(),
            )
            .await
            .with_context(|| format!("create_virtual_folder failed for {:?}", entry_path))?;

            // normalize child path
            let normalized = normalize_path(&entry_path);

            let child_real_folder_id =
                ensure_real_folder(tx, sroot_id.clone(), &normalized).await?;

            // mount child vf <-> child real folder
            FileRepository::create_virtual_folder_mount(
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

    let file_path_id = FileRepository::insert_file_path(tx.as_mut(), &file_info).await?;

    // upsert file_content
    let file_content_id = FileRepository::upsert_file_content(tx.as_mut(), &file_info).await?;

    if NodeRepository::exists_node_with_file_content(tx.as_mut(), file_content_id.clone()).await? {
        return Ok(());
    }

    NodeRepository::create_file_node(
        tx.as_mut(),
        parent_virtual_folder_id.to_string(),
        file_content_id.clone(),
    )
    .await?;
    // binding
    FileRepository::upsert_file_path_content_binding(tx.as_mut(), &file_path_id, &file_content_id)
        .await?;

    Ok(())
}

pub async fn ensure_real_folder(
    tx: &mut Transaction<'_, Sqlite>,
    sroot_id: String,
    norm_path: &std::path::PathBuf,
) -> Result<String> {
    let mut current_parent_id: Option<String> = None;

    let mount_path = SrootRepository::fetch_mount_path(tx.as_mut(), &sroot_id)
        .await?
        .ok_or_else(|| anyhow!("Failed to fetch mount path"))?;

    let components_path =
        if let Ok(sub_path) = norm_path.strip_prefix(&mount_path) { sub_path } else { norm_path };

    let components: Vec<&str> = if components_path.as_os_str().is_empty() {
        vec![""]
    } else {
        components_path
            .components()
            .filter_map(|c| c.as_os_str().to_str())
            .filter(|s| !s.is_empty())
            .collect()
    };

    let mut rel_path = PathBuf::from("");
    let mut abs_path = PathBuf::from(&mount_path);

    let now = crate::utils::date::get_now_date();

    for component in components {
        abs_path.push(component);
        rel_path.push(component);

        let metadata = tokio::fs::metadata(&abs_path).await?;
        let mtime = file_mtime_epoch(&metadata)?;

        let data = RealFolderData {
            id: "".to_string(), // not needed for upsert
            storage_root_id: Some(sroot_id.to_owned()),
            parent_id: current_parent_id.clone(),
            name: component.to_string(),
            name_norm: component.to_lowercase(),
            root_rel_path: Some(rel_path.to_string_lossy().into_owned()),
            abs_path_cached: Some(abs_path.to_string_lossy().into_owned()),
            mtime: mtime,
            error_flag: crate::config::file::IntegrityCheckResult::Success,
            error_msg: None,
            last_seen_scan_id: None,
            last_seen_at: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        let id = FileRepository::upsert_real_folder(tx.as_mut(), &data).await?;
        current_parent_id = Some(id);
    }

    if let Some(id) = current_parent_id {
        Ok(id)
    } else {
        Err(anyhow::anyhow!("Failed to create or find real_folder ID"))
    }
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
#[allow(dead_code)]
fn sha256_of(path: &Path) -> Result<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();

    io::copy(&mut reader, &mut hasher)?;
    Ok(format!("{:x}", hasher.finalize()))
}

#[allow(dead_code)]
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

pub fn _xxh3_644_of_img(path: &Path) -> Result<String> {
    if !matches!(FileType::from(path), FileType::Image) {
        bail!("Not an image file: {}", path.display());
    }
    FileType::check_is_img(path)?;
    xxh3_64_of(path)
}

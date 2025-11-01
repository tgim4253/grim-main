use std::path::{Path, PathBuf};

use anyhow::{anyhow, bail, Context, Result};
use chrono::Local;
use tokio::{fs, io::AsyncWriteExt};

use crate::{
    bootstrap::PATH_MANAGER,
    db::repository::{
        connection_repository::ConnectionRepository,
        file_repository::{FilePathRecord, FileRepository},
        graph_repository::GraphRepository,
        node_repository::NodeRepository,
    },
    models::{
        connection::RelationType,
        document::{
            CreateDocumentPayload, DocumentData, DocumentUpdateResult,
            LoadDocumentPayload, UpdateDocumentPayload,
        },
        file::{FileInfo, FileType},
        graph::GraphResponse,
        node::NodeData,
    },
    services::{
        connection_rules::{load_engine_for_moa, resolve_for_nodes},
        db::DB_MANAGER,
        file_service::asset::ensure_file_asset_binding,
        storage_root,
    },
    utils::{date::get_now_date, path_utils::normalize_path},
};

const DOCUMENT_DIR_NAME: &str = "document";
const DEFAULT_DOCUMENT_PREFIX: &str = "document";
const DOCUMENT_EXTENSION: &str = "md";

fn build_document_path(record: &FilePathRecord) -> Option<PathBuf> {
    let base = record.abs_path_cached.as_ref()?;
    let mut path = PathBuf::from(base);
    path.push(&record.file_name);
    Some(path)
}

/// Create a new markdown document under the workspace document directory and link it to the anchor node.
pub async fn create_document(
    payload: CreateDocumentPayload,
) -> Result<GraphResponse> {
    let CreateDocumentPayload { moa_id, anchor_node_id, base_name } = payload;

    if moa_id.trim().is_empty() {
        bail!("moa id is required");
    }
    if anchor_node_id.trim().is_empty() {
        bail!("anchor node id is required");
    }

    let paths = PATH_MANAGER
        .get_or_add(&moa_id)
        .await
        .context("failed to resolve moa paths")?;

    let document_dir = paths.base_dir.join(DOCUMENT_DIR_NAME);
    fs::create_dir_all(&document_dir).await.with_context(|| {
        format!(
            "failed to prepare document directory at {}",
            document_dir.display()
        )
    })?;

    let file_stem = normalize_base_name(base_name.as_deref());
    let file_name = format!("{file_stem}.{DOCUMENT_EXTENSION}");
    let file_path = document_dir.join(&file_name);

    // Use create_new to ensure we don't overwrite existing files.
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&file_path)
        .await
        .with_context(|| {
            format!("failed to create document at {}", file_path.display())
        })?;

    let heading = derive_heading(&file_stem);
    let content = format!("# {heading}\n\n");
    file.write_all(content.as_bytes()).await.with_context(|| {
        format!(
            "failed to write initial document contents to {}",
            file_path.display()
        )
    })?;

    let file_path = normalize_path(&file_path);
    let parent = file_path
        .parent()
        .ok_or_else(|| anyhow!("document path has no parent directory"))?;
    let parent_norm = normalize_path(parent);

    let storage_info = storage_root::detect_storage_root(&parent_norm)
        .context("failed to detect storage root for document directory")?;

    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;
    let real_folder_id = storage_root::ensure_storage_root_and_real_folder(
        &mut tx,
        &storage_info,
        &parent_norm,
    )
    .await
    .context("failed to ensure document folder in database")?;

    let file_info = FileInfo::new(
        &moa_id,
        &file_path,
        real_folder_id.clone(),
        file_name.clone(),
    )
    .await
    .context("failed to load document metadata")?;

    let (asset_id, _) = ensure_file_asset_binding(&mut tx, &file_info)
        .await
        .context("failed to upsert document asset binding")?;

    let file_node_id = if let Some(node_id) =
        NodeRepository::fetch_node_id_by_asset_id(tx.as_mut(), asset_id.clone())
            .await?
    {
        node_id
    } else {
        NodeRepository::create_orphan_file_node(tx.as_mut(), asset_id.clone())
            .await?
    };

    let mut forward_relation = None;
    let mut reverse_relation = None;
    let engine = load_engine_for_moa(&moa_id)
        .await
        .context("failed to load connection rules")?;

    if let Some(action) = resolve_for_nodes(
        tx.as_mut(),
        &engine,
        &anchor_node_id,
        &file_node_id,
        None,
        false,
    )
    .await
    .context("failed to resolve connection rules")?
    {
        forward_relation = Some(action.forward_relation);
        reverse_relation = Some(action.reverse_relation);
    }

    if forward_relation.is_none() && reverse_relation.is_none() {
        forward_relation = Some(RelationType::RelativeFile);
        reverse_relation = Some(RelationType::RelativeFile);
    }

    let now = get_now_date();
    match (forward_relation, reverse_relation) {
        (Some(forward), Some(reverse)) => {
            ConnectionRepository::insert_pair(
                tx.as_mut(),
                anchor_node_id.clone(),
                file_node_id.clone(),
                forward,
                reverse,
                now.clone(),
            )
            .await
            .context("failed to insert document connection pair")?;
        }
        (Some(forward), None) => {
            ConnectionRepository::insert_connection(
                tx.as_mut(),
                anchor_node_id.clone(),
                file_node_id.clone(),
                forward,
                now.clone(),
            )
            .await
            .context("failed to insert forward document connection")?;
        }
        (None, Some(reverse)) => {
            ConnectionRepository::insert_connection(
                tx.as_mut(),
                file_node_id.clone(),
                anchor_node_id.clone(),
                reverse,
                now.clone(),
            )
            .await
            .context("failed to insert reverse document connection")?;
        }
        (None, None) => {}
    }

    let graph = GraphRepository::get_graph_from_root(
        tx.as_mut(),
        anchor_node_id.clone(),
        None,
    )
    .await
    .context("failed to load graph after document creation")?;

    tx.commit()
        .await
        .context("failed to commit document creation transaction")?;

    Ok(graph)
}

/// Load an existing markdown document and return its contents.
pub async fn load_document(
    payload: LoadDocumentPayload,
) -> Result<DocumentData> {
    let LoadDocumentPayload { moa_id, node_id } = payload;

    if moa_id.trim().is_empty() {
        bail!("moa id is required");
    }
    if node_id.trim().is_empty() {
        bail!("node id is required");
    }

    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let node =
        NodeRepository::fetch_file_node_data(tx.as_mut(), node_id.clone())
            .await
            .context("failed to fetch document node data")?;

    let file = match node {
        NodeData::File(file) => file,
        _ => bail!("requested node is not a file"),
    };

    if file.kind != FileType::Document {
        bail!("requested file is not a document");
    }

    let asset_id = FileRepository::find_file_asset_id_by_content(
        tx.as_mut(),
        &file.file_id,
    )
    .await?
    .ok_or_else(|| anyhow!("document asset not found"))?;

    let paths = FileRepository::fetch_paths_for_asset(tx.as_mut(), &asset_id)
        .await
        .context("failed to load document file path")?;

    let record =
        paths.first().ok_or_else(|| anyhow!("document file path not found"))?;

    let path = build_document_path(record)
        .ok_or_else(|| anyhow!("document absolute path is unavailable"))?;

    tx.commit().await?;

    let markdown = fs::read_to_string(&path).await.with_context(|| {
        format!("failed to read document at {}", path.display())
    })?;

    Ok(DocumentData { node_id, file_name: file.file_name, markdown })
}

/// Persist document changes and optionally rename the underlying file.
pub async fn update_document(
    payload: UpdateDocumentPayload,
) -> Result<DocumentUpdateResult> {
    let UpdateDocumentPayload { moa_id, node_id, markdown, base_name } =
        payload;

    if moa_id.trim().is_empty() {
        bail!("moa id is required");
    }
    if node_id.trim().is_empty() {
        bail!("node id is required");
    }

    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let node =
        NodeRepository::fetch_file_node_data(tx.as_mut(), node_id.clone())
            .await
            .context("failed to fetch document node data")?;

    let file = match node {
        NodeData::File(file) => file,
        _ => bail!("requested node is not a file"),
    };

    if file.kind != FileType::Document {
        bail!("requested file is not a document");
    }

    let asset_id = FileRepository::find_file_asset_id_by_content(
        tx.as_mut(),
        &file.file_id,
    )
    .await?
    .ok_or_else(|| anyhow!("document asset not found"))?;

    let paths = FileRepository::fetch_paths_for_asset(tx.as_mut(), &asset_id)
        .await
        .context("failed to load document file path")?;

    let path_record =
        paths.first().ok_or_else(|| anyhow!("document file path not found"))?;

    let existing_info =
        FileRepository::fetch_file_info(tx.as_mut(), &path_record.id)
            .await?
            .ok_or_else(|| anyhow!("document file metadata missing"))?;

    let current_path = build_document_path(path_record)
        .ok_or_else(|| anyhow!("document absolute path is unavailable"))?;

    let parent_dir = current_path
        .parent()
        .ok_or_else(|| anyhow!("document path has no parent directory"))?
        .to_path_buf();

    let desired_stem = if base_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
    {
        normalize_base_name(base_name.as_deref())
    } else {
        normalize_base_name(Some(&existing_info.file_name))
    };

    let file_name = format!("{desired_stem}.{DOCUMENT_EXTENSION}");
    let target_path = parent_dir.join(&file_name);

    if target_path != current_path {
        fs::rename(&current_path, &target_path).await.with_context(|| {
            format!(
                "failed to rename document from {} to {}",
                current_path.display(),
                target_path.display()
            )
        })?;
    }

    fs::write(&target_path, markdown.as_bytes()).await.with_context(|| {
        format!("failed to write document to {}", target_path.display())
    })?;

    let normalized_path = normalize_path(&target_path);

    let file_info = FileInfo::new(
        &moa_id,
        &normalized_path,
        existing_info.real_folder_id.clone(),
        file_name.clone(),
    )
    .await
    .context("failed to refresh document file metadata")?;

    let new_path_id = FileRepository::insert_file_path(tx.as_mut(), &file_info)
        .await
        .context("failed to upsert document file path")?;

    if new_path_id != path_record.id {
        FileRepository::delete_file_path(tx.as_mut(), &path_record.id)
            .await
            .context("failed to remove old document file path")?;
    }

    let file_content_id =
        FileRepository::upsert_file_content(tx.as_mut(), &file_info)
            .await
            .context("failed to update document content metadata")?;

    FileRepository::update_file_asset_content(
        tx.as_mut(),
        &asset_id,
        &file_content_id,
        false,
    )
    .await
    .context("failed to update document asset")?;

    FileRepository::upsert_file_path_asset_binding(
        tx.as_mut(),
        &new_path_id,
        &asset_id,
    )
    .await
    .context("failed to bind document path to asset")?;

    let node =
        NodeRepository::fetch_file_node_data(tx.as_mut(), node_id.clone())
            .await
            .context("failed to reload document node data")?;

    tx.commit().await?;

    let file = match node {
        NodeData::File(file) => file,
        _ => bail!("document node is missing file data"),
    };

    Ok(DocumentUpdateResult { file })
}

fn normalize_base_name(raw: Option<&str>) -> String {
    let value = raw.unwrap_or("").trim();
    if value.is_empty() {
        return default_document_stem();
    }

    let path_like = Path::new(value);
    let stem =
        path_like.file_stem().and_then(|os| os.to_str()).unwrap_or(value);

    let sanitized = sanitize_file_stem(stem);
    if sanitized.is_empty() {
        default_document_stem()
    } else {
        sanitized
    }
}

fn sanitize_file_stem(value: &str) -> String {
    const INVALID: [char; 9] = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let mut sanitized: String =
        value
            .chars()
            .map(|ch| {
                if INVALID.contains(&ch) || ch.is_control() {
                    '_'
                } else {
                    ch
                }
            })
            .collect();
    sanitized = sanitized.trim_matches('.').trim().to_string();
    sanitized
}

fn default_document_stem() -> String {
    format!(
        "{}-{}",
        DEFAULT_DOCUMENT_PREFIX,
        Local::now().format("%Y%m%d-%H%M%S")
    )
}

fn derive_heading(stem: &str) -> String {
    let candidate = stem.replace(['_', '-'], " ").trim().to_string();
    if candidate.is_empty() {
        DEFAULT_DOCUMENT_PREFIX.to_string()
    } else {
        candidate
    }
}

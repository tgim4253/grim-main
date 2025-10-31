use std::path::Path;

use anyhow::{anyhow, bail, Context, Result};
use chrono::Local;
use tokio::{fs, io::AsyncWriteExt};

use crate::{
    bootstrap::PATH_MANAGER,
    db::repository::{
        connection_repository::ConnectionRepository,
        graph_repository::GraphRepository, node_repository::NodeRepository,
    },
    models::{
        connection::RelationType, document::CreateDocumentPayload,
        file::FileInfo, graph::GraphResponse,
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

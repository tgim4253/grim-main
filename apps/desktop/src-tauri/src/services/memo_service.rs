use anyhow::{anyhow, bail, Result};

use crate::{
    db::repository::{
        connection_repository::ConnectionRepository,
        graph_repository::GraphRepository,
        memo_repository::{MemoRepository, NewMemo},
        node_repository::NodeRepository,
    },
    models::{
        connection::RelationType,
        memo::{
            CreateMemoPayload, CreateMemoResult, NodeMemo, UpdateMemoPayload,
        },
        node::NodeKind,
    },
    services::{db::DB_MANAGER, image_crop_service::create_image_crop_in_tx},
    utils::date::get_now_date,
};

/// Create a memo node optionally linked with a newly created crop.
pub async fn create_memo(
    moa_id: &str,
    payload: CreateMemoPayload,
) -> Result<CreateMemoResult> {
    let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;
    let now = get_now_date();

    let CreateMemoPayload { target_node_id, text, crop, origin_hash } = payload;

    let mut root_node_id = target_node_id.clone();
    let mut attachment_node_id = target_node_id.clone();

    if let Some(crop_payload) = crop.as_ref() {
        let crop_node_id = create_image_crop_in_tx(
            tx.as_mut(),
            &target_node_id,
            origin_hash.as_deref(),
            &crop_payload.rect,
            crop_payload.reference_width,
            crop_payload.reference_height,
            crop_payload.is_relative,
            &now,
        )
        .await?;

        attachment_node_id = crop_node_id;
    } else {
        // Ensure the target node exists and is a file or crop.
        let kind = sqlx::query_scalar!(
            r#"
            SELECT kind FROM node WHERE id = ?1
            "#,
            &target_node_id
        )
        .fetch_optional(tx.as_mut())
        .await?
        .ok_or_else(|| anyhow!("Target node not found"))?;

        if kind != "file" && kind != "crop" {
            bail!("Memos can only be attached to files or crops");
        }
    }

    let memo_node_id =
        NodeRepository::insert_node(tx.as_mut(), NodeKind::Memo, &now).await?;

    MemoRepository::insert_memo(
        tx.as_mut(),
        NewMemo { node_id: &memo_node_id, text: &text, now: &now },
    )
    .await?;

    ConnectionRepository::insert_connection(
        tx.as_mut(),
        attachment_node_id.clone(),
        memo_node_id.clone(),
        RelationType::Memo,
        now.clone(),
    )
    .await?;

    ConnectionRepository::insert_connection(
        tx.as_mut(),
        memo_node_id.clone(),
        attachment_node_id.clone(),
        RelationType::MemoTarget,
        now.clone(),
    )
    .await?;

    // Reuse the memo repository helper so memo hydration stays consistent with
    // other node-loading paths (for example the graph loader in
    // `NodeRepository::fetch_nodes_by_ids`). Even when we only need the single
    // row we rely on the shared helper to ensure the same joins and mapping
    // logic are applied everywhere.
    let memo = MemoRepository::fetch_memos_by_node_ids(
        tx.as_mut(),
        &[memo_node_id.clone()],
    )
    .await?
    .into_iter()
    .next()
    .ok_or_else(|| anyhow!("Failed to load memo after insert"))?;

    let graph = GraphRepository::get_graph_from_root(
        tx.as_mut(),
        root_node_id.clone(),
        None,
    )
    .await?;

    tx.commit().await?;

    Ok(CreateMemoResult { memo, graph })
}

/// Update the text of a memo node.
pub async fn update_memo_text(
    moa_id: &str,
    payload: UpdateMemoPayload,
) -> Result<NodeMemo> {
    let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;
    let now = get_now_date();

    let UpdateMemoPayload { node_id, text } = payload;

    let kind = sqlx::query_scalar!(
        r#"
        SELECT kind FROM node WHERE id = ?1
        "#,
        &node_id
    )
    .fetch_optional(tx.as_mut())
    .await?
    .ok_or_else(|| anyhow!("Memo node not found"))?;

    if kind != "memo" {
        bail!("Node is not a memo");
    }

    MemoRepository::update_memo_text(tx.as_mut(), &node_id, &text, &now)
        .await?;

    // See note above about using the shared memo fetch helper so the row is
    // hydrated identically to bulk node loads.
    let memo = MemoRepository::fetch_memos_by_node_ids(
        tx.as_mut(),
        &[node_id.clone()],
    )
    .await?
    .into_iter()
    .next()
    .ok_or_else(|| anyhow!("Failed to load memo after update"))?;

    tx.commit().await?;

    Ok(memo)
}

use anyhow::{anyhow, bail, Result};

use crate::{
    db::repository::{
        connection_repository::ConnectionRepository,
        crop_repository::{CropRepository, NewImageCrop},
        graph_repository::GraphRepository,
        node_repository::NodeRepository,
    },
    models::{
        connection::RelationType,
        crop::{CreateImageCropPayload, CropRectangle},
        file::FileType,
        graph::GraphResponse,
        node::{NodeData, NodeKind},
    },
    services::db::DB_MANAGER,
    utils::date::get_now_date,
};

const EPSILON: f64 = 1e-6;

fn is_full_image(
    rect: &CropRectangle,
    is_relative: bool,
    ref_w: Option<i64>,
    ref_h: Option<i64>,
) -> bool {
    if is_relative {
        (rect.start_x.abs() <= EPSILON)
            && (rect.start_y.abs() <= EPSILON)
            && ((rect.width - 1.0).abs() <= EPSILON)
            && ((rect.height - 1.0).abs() <= EPSILON)
    } else if let (Some(rw), Some(rh)) = (ref_w, ref_h) {
        (rect.start_x.abs() <= EPSILON)
            && (rect.start_y.abs() <= EPSILON)
            && ((rect.width - rw as f64).abs() <= EPSILON)
            && ((rect.height - rh as f64).abs() <= EPSILON)
    } else {
        false
    }
}

fn validate_crop(
    rect: &CropRectangle,
    is_relative: bool,
    ref_w: Option<i64>,
    ref_h: Option<i64>,
) -> Result<()> {
    if rect.width <= 0.0 || rect.height <= 0.0 {
        bail!("Crop dimensions must be greater than zero");
    }

    if !is_relative && (ref_w.is_none() || ref_h.is_none()) {
        bail!("Absolute crops require reference dimensions");
    }

    if is_full_image(rect, is_relative, ref_w, ref_h) {
        bail!("Full-image crops are not allowed");
    }

    Ok(())
}

/// Persist a crop node and return the updated neighbourhood graph.
pub async fn create_image_crop(
    moa_id: &str,
    payload: CreateImageCropPayload,
) -> Result<GraphResponse> {
    let CreateImageCropPayload {
        origin_node_id,
        origin_hash,
        rect,
        reference_width,
        reference_height,
        is_relative,
    } = payload;

    validate_crop(&rect, is_relative, reference_width, reference_height)?;

    let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;

    let node_data = NodeRepository::fetch_file_node_data(
        tx.as_mut(),
        origin_node_id.clone(),
    )
    .await
    .map_err(|err| anyhow!("Failed to load origin node: {err}"))?;

    let NodeData::File(origin_file) = node_data else {
        bail!("The origin node is not a file");
    };

    if origin_file.kind != FileType::Image {
        bail!("Only image files can be cropped");
    }

    if !origin_file.xxh3_64.eq_ignore_ascii_case(origin_hash.as_str()) {
        bail!("Origin hash does not match the stored image hash");
    }

    let now = get_now_date();

    let crop_node_id =
        NodeRepository::insert_node(tx.as_mut(), NodeKind::Crop, &now).await?;

    CropRepository::insert_crop(
        tx.as_mut(),
        NewImageCrop {
            node_id: &crop_node_id,
            origin_hash: &origin_file.xxh3_64,
            start_x: rect.start_x,
            start_y: rect.start_y,
            width: rect.width,
            height: rect.height,
            reference_width,
            reference_height,
            is_relative,
            now: &now,
        },
    )
    .await?;

    ConnectionRepository::insert_connection(
        tx.as_mut(),
        origin_node_id.clone(),
        crop_node_id.clone(),
        RelationType::Cropped,
        now.clone(),
    )
    .await?;

    ConnectionRepository::insert_connection(
        tx.as_mut(),
        crop_node_id.clone(),
        origin_node_id.clone(),
        RelationType::CroppedOrigin,
        now.clone(),
    )
    .await?;

    let graph = GraphRepository::get_graph_from_root(
        tx.as_mut(),
        origin_node_id.clone(),
        None,
    )
    .await?;

    tx.commit().await?;

    Ok(graph)
}

use anyhow::{anyhow, bail, Result};
use sqlx::{Sqlite, Transaction};

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

pub(crate) fn validate_crop(
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

pub(crate) struct ImageCropOptions<'a> {
    pub expected_origin_hash: Option<&'a str>,
    pub rect: &'a CropRectangle,
    pub reference_width: Option<i64>,
    pub reference_height: Option<i64>,
    pub is_relative: bool,
    pub now: &'a str,
}

pub(crate) async fn create_image_crop_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    origin_node_id: &str,
    options: ImageCropOptions<'_>,
) -> Result<String> {
    validate_crop(
        options.rect,
        options.is_relative,
        options.reference_width,
        options.reference_height,
    )?;

    let node_data = NodeRepository::fetch_file_node_data(
        tx.as_mut(),
        origin_node_id.to_string(),
    )
    .await
    .map_err(|err| anyhow!("Failed to load origin node: {err}"))?;

    let NodeData::File(origin_file) = node_data else {
        bail!("The origin node is not a file");
    };

    if origin_file.kind != FileType::Image {
        bail!("Only image files can be cropped");
    }

    if let Some(expected_hash) = options.expected_origin_hash {
        if !origin_file.xxh3_64.eq_ignore_ascii_case(expected_hash) {
            bail!("Origin hash does not match the stored image hash");
        }
    }

    let crop_node_id =
        NodeRepository::insert_node(tx.as_mut(), NodeKind::Crop, options.now)
            .await?;

    CropRepository::insert_crop(
        tx.as_mut(),
        NewImageCrop {
            node_id: &crop_node_id,
            origin_hash: &origin_file.xxh3_64,
            start_x: options.rect.start_x,
            start_y: options.rect.start_y,
            width: options.rect.width,
            height: options.rect.height,
            reference_width: options.reference_width,
            reference_height: options.reference_height,
            is_relative: options.is_relative,
            now: options.now,
        },
    )
    .await?;

    let origin_id = origin_node_id.to_string();
    let now_owned = options.now.to_string();

    ConnectionRepository::insert_connection(
        tx.as_mut(),
        origin_id.clone(),
        crop_node_id.clone(),
        RelationType::Cropped,
        now_owned.clone(),
    )
    .await?;

    ConnectionRepository::insert_connection(
        tx.as_mut(),
        crop_node_id.clone(),
        origin_id,
        RelationType::CroppedOrigin,
        now_owned,
    )
    .await?;

    Ok(crop_node_id)
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

    let mut tx = DB_MANAGER.create_new_tx(moa_id).await?;
    let now = get_now_date();

    create_image_crop_in_tx(
        &mut tx,
        &origin_node_id,
        ImageCropOptions {
            expected_origin_hash: Some(origin_hash.as_str()),
            rect: &rect,
            reference_width,
            reference_height,
            is_relative,
            now: &now,
        },
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

use crate::{
    models::{crop::CreateImageCropPayload, graph::GraphResponse},
    services::image_crop_service,
};

#[tauri::command]
/// Create a crop node linked to the provided origin image.
pub async fn create_image_crop(
    moa_id: String,
    payload: CreateImageCropPayload,
) -> Result<GraphResponse, String> {
    image_crop_service::create_image_crop(&moa_id, payload)
        .await
        .map_err(|err| err.to_string())
}

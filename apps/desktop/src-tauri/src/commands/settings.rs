use crate::{
    bootstrap::PATH_MANAGER, config::settings::MoaSettings, services::settings,
};

#[tauri::command]
pub async fn load_settings(moa_id: String) -> Result<MoaSettings, String> {
    let paths = PATH_MANAGER
        .get_or_add(&moa_id)
        .await
        .map_err(|err| err.to_string())?;

    settings::load(&paths).await.map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn save_settings(
    moa_id: String,
    payload: MoaSettings,
) -> Result<MoaSettings, String> {
    let paths = PATH_MANAGER
        .get_or_add(&moa_id)
        .await
        .map_err(|err| err.to_string())?;

    settings::save(&paths, &payload).await.map_err(|err| err.to_string())?;

    settings::load(&paths).await.map_err(|err| err.to_string())
}

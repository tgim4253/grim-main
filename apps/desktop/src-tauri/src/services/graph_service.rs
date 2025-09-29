use std::io::ErrorKind;

use anyhow::{Context, Result};
use tokio::fs;
use tracing::warn;

use crate::{
    bootstrap::PATH_MANAGER,
    db::repository::graph_repository::GraphRepository,
    models::{
        graph::GraphResponse,
        graph_settings::{GraphOption, GraphPreferences, GraphPreset},
        panel_settings::PanelPreferences,
    },
    services::db::DB_MANAGER,
    utils::identifier::get_unique_id,
};

/// Fetch a neighbourhood graph for a given node within a workspace.
pub async fn get_graph_one(
    moa_id: String,
    node_id: String,
) -> Result<GraphResponse> {
    let mut tx = DB_MANAGER.create_new_tx(&moa_id).await?;

    let response =
        GraphRepository::get_graph_from_root(tx.as_mut(), node_id, None)
            .await?;

    tx.commit().await?;

    Ok(response)
}

const DEFAULT_GRAPH_PRESET_NAME: &str = "기본 그래프";
const DEFAULT_PANEL_VIEW: &str = "graph";
const PANEL_SETTINGS_FILE: &str = "panel.json";
const LEGACY_GRAPH_SETTINGS_FILE: &str = "graph.json";

fn build_default_graph_preferences() -> GraphPreferences {
    let preset_id = get_unique_id();
    GraphPreferences {
        active_preset_id: preset_id.clone(),
        presets: vec![GraphPreset {
            id: preset_id,
            name: DEFAULT_GRAPH_PRESET_NAME.to_string(),
            option: GraphOption::default(),
        }],
    }
}

fn normalise_graph_preferences(
    mut preferences: GraphPreferences,
) -> GraphPreferences {
    if preferences.presets.is_empty() {
        return build_default_graph_preferences();
    }

    for preset in preferences.presets.iter_mut() {
        if preset.name.trim().is_empty() {
            preset.name = DEFAULT_GRAPH_PRESET_NAME.to_string();
        }
    }

    if preferences.active_preset_id.is_empty()
        || !preferences
            .presets
            .iter()
            .any(|preset| preset.id == preferences.active_preset_id)
    {
        if let Some(first) = preferences.presets.first() {
            preferences.active_preset_id = first.id.clone();
        }
    }

    preferences
}

fn build_default_panel_preferences() -> PanelPreferences {
    PanelPreferences {
        graph: build_default_graph_preferences(),
        grid: None,
        active_view: Some(DEFAULT_PANEL_VIEW.to_string()),
        root_node_id: None,
    }
}

fn normalise_panel_preferences(
    mut preferences: PanelPreferences,
) -> PanelPreferences {
    preferences.graph = normalise_graph_preferences(preferences.graph);

    match preferences.active_view.as_deref() {
        Some("graph" | "grid" | "viewer") => {}
        _ => {
            preferences.active_view = Some(DEFAULT_PANEL_VIEW.to_string());
        }
    }

    preferences
}

async fn load_legacy_graph_preferences(
    settings_dir: &std::path::Path,
) -> Result<Option<PanelPreferences>> {
    let legacy_path = settings_dir.join(LEGACY_GRAPH_SETTINGS_FILE);
    match fs::read(&legacy_path).await {
        Ok(payload) => {
            let preferences =
                serde_json::from_slice::<GraphPreferences>(&payload)
                    .map(normalise_graph_preferences)
                    .map(|graph| PanelPreferences {
                        graph,
                        grid: None,
                        active_view: Some(DEFAULT_PANEL_VIEW.to_string()),
                        root_node_id: None,
                    })
                    .map_err(|error| {
                        warn!(
                            ?error,
                            path = %legacy_path.display(),
                            "Failed to parse legacy graph preferences",
                        );
                        error
                    })
                    .ok();

            Ok(preferences)
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(error) => {
            warn!(
                ?error,
                path = %legacy_path.display(),
                "Failed to read legacy graph preferences",
            );
            Ok(None)
        }
    }
}

/// Load persisted panel preferences for the provided workspace, migrating legacy graph
/// preferences when present and falling back to defaults on failure.
pub async fn load_panel_preferences(moa_id: &str) -> Result<PanelPreferences> {
    let paths = PATH_MANAGER
        .get_or_add(moa_id)
        .await
        .context("Failed to resolve workspace paths")?;

    let settings_dir = paths.moa_dir.join("settings");
    let file_path = settings_dir.join(PANEL_SETTINGS_FILE);

    match fs::read(&file_path).await {
        Ok(payload) => {
            match serde_json::from_slice::<PanelPreferences>(&payload) {
                Ok(preferences) => Ok(normalise_panel_preferences(preferences)),
                Err(error) => {
                    warn!(
                        ?error,
                        path = %file_path.display(),
                        "Failed to parse panel preferences; falling back to defaults",
                    );
                    Ok(build_default_panel_preferences())
                }
            }
        }
        Err(error) if error.kind() == ErrorKind::NotFound => {
            match load_legacy_graph_preferences(&settings_dir).await? {
                Some(preferences) => {
                    if let Err(save_error) =
                        save_panel_preferences(moa_id, &preferences).await
                    {
                        warn!(
                            ?save_error,
                            "Failed to persist migrated panel preferences",
                        );
                    }
                    Ok(preferences)
                }
                None => Ok(build_default_panel_preferences()),
            }
        }
        Err(error) => {
            warn!(
                ?error,
                path = %file_path.display(),
                "Failed to read panel preferences; falling back to defaults",
            );
            Ok(build_default_panel_preferences())
        }
    }
}

/// Persist panel preferences for a workspace into the `.moa/settings` directory.
pub async fn save_panel_preferences(
    moa_id: &str,
    preferences: &PanelPreferences,
) -> Result<()> {
    let paths = PATH_MANAGER
        .get_or_add(moa_id)
        .await
        .context("Failed to resolve workspace paths")?;

    let settings_dir = paths.moa_dir.join("settings");
    fs::create_dir_all(&settings_dir).await.with_context(|| {
        format!(
            "Failed to create settings directory at {}",
            settings_dir.display()
        )
    })?;

    let file_path = settings_dir.join(PANEL_SETTINGS_FILE);
    let normalised = normalise_panel_preferences(preferences.clone());
    let payload = serde_json::to_vec_pretty(&normalised)
        .context("Failed to serialise panel preferences")?;
    fs::write(&file_path, payload).await.with_context(|| {
        format!("Failed to write panel preferences to {}", file_path.display())
    })?;

    Ok(())
}

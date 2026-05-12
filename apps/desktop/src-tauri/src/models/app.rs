use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppStartupState {
    pub is_initial_launch: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CompleteInitialLaunchPayload {
    #[serde(default)]
    pub template_start_enabled: bool,
    #[serde(default)]
    pub language: Option<String>,
}

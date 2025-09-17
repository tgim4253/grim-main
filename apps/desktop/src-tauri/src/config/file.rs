use serde::{Deserialize, Serialize};
use sqlx::prelude::Type;

/// Result of a file integrity check against the on-disk state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[sqlx(type_name = "TEXT")]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum IntegrityCheckResult {
    NotFound,
    Success,
    Mismatch,
}

/// Indicates whether a file path matches stored metadata.
#[derive(
    Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, Default,
)]
#[sqlx(type_name = "TEXT")]
#[sqlx(rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum MatchStates {
    #[default]
    Unknown,
    Mismatch,
    Match,
}

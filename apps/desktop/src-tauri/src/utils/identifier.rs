/// Generate a random UUID v4 as a string.
pub fn get_unique_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Type alias for IDs stored as UUID values.
pub type IdType = uuid::Uuid;

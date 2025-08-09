pub fn get_unique_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

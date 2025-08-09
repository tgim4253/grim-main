pub fn get_now_date() -> String {
    chrono::Utc::now().to_rfc3339()
}

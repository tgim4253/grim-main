/// Return the current UTC timestamp in RFC 3339 format.
pub fn get_now_date() -> String {
    chrono::Utc::now().to_rfc3339()
}

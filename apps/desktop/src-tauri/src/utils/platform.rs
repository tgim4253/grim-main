use crate::models::file::OsPlatform;

pub fn get_current_platfrom() -> OsPlatform {
    #[cfg(target_os = "windows")]
    let platform = OsPlatform::Windows;

    #[cfg(target_os = "macos")]
    let platform = OsPlatform::Macos;

    #[cfg(target_os = "linux")]
    let platform = OsPlatform::Linux;

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    let platform = OsPlatform::Unknown;

    platform
}

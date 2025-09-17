use std::path::Path;

/// Determine whether the provided path should be treated as hidden on Unix platforms.
#[cfg(unix)]
pub fn check_is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.starts_with('.'))
        .unwrap_or(false)
}

/// Determine whether the provided path should be treated as hidden on Windows.
#[cfg(windows)]
pub fn check_is_hidden(path: &Path) -> bool {
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::fileapi::GetFileAttributesW;
    use winapi::um::winnt::FILE_ATTRIBUTE_HIDDEN;

    let wide: Vec<u16> =
        path.as_os_str().encode_wide().chain(Some(0)).collect();

    unsafe {
        let attrs = GetFileAttributesW(wide.as_ptr());
        if attrs == u32::MAX {
            return false;
        }
        (attrs & FILE_ATTRIBUTE_HIDDEN) != 0
    }
}

use std::path::{Path, PathBuf};
use tauri::{path::BaseDirectory, AppHandle, Manager};

pub fn get_moa_file_path(app: &AppHandle) -> PathBuf {
    app.path()
        .resolve("moa.json", BaseDirectory::AppData)
        .unwrap_or_else(|_| std::env::current_dir().unwrap().join("moa.json"))
}

pub fn normalize_path<P>(path: P) -> PathBuf
where
    P: AsRef<Path>,
{
    let path = path.as_ref();
    let abs = dunce::canonicalize(path).unwrap_or_else(|_| PathBuf::from(path)); // resolves . and ..

    #[cfg(windows)]
    {
        // Convert backslashes to forward slashes
        let s = abs.to_string_lossy().replace("\\", "/");

        // Uppercase drive letter if present
        // ex) c:/ -> C:/
        if s.len() >= 2 && s.as_bytes()[1] == b':' {
            let mut chars: Vec<char> = s.chars().collect();
            chars[0] = chars[0].to_ascii_uppercase();
            return PathBuf::from(chars.into_iter().collect::<String>());
        }
        PathBuf::from(s)
    }

    #[cfg(not(windows))]
    abs
}

pub fn concat_paths(paths: &[PathBuf]) -> PathBuf {
    let mut result = PathBuf::new();
    for path in paths {
        result.push(path);
    }
    result
}

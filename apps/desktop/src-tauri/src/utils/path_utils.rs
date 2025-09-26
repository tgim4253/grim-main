use std::path::{Component, Path, PathBuf};
use tauri::{path::BaseDirectory, AppHandle, Manager};

/// Compute the on-disk path that stores the persisted Moa list.
pub fn get_moa_file_path(app: &AppHandle) -> PathBuf {
    app.path()
        .resolve("moa.json", BaseDirectory::AppData)
        .unwrap_or_else(|_| std::env::current_dir().unwrap().join("moa.json"))
}

/// Normalize a filesystem path and apply platform-specific casing rules.
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

/// Concatenate a sequence of path segments into a single `PathBuf`.
pub fn concat_paths(paths: &[PathBuf]) -> PathBuf {
    let mut result = PathBuf::new();
    for path in paths {
        result.push(path);
    }
    result
}

/// Resolve the directory that contains the currently running executable.
pub fn get_executable_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(normalize_path))
        .or_else(|| std::env::current_dir().ok().map(normalize_path))
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Convert an absolute path into a path relative to the executable directory.
/// Returns the original path if a relative representation cannot be produced
/// (for example, when the paths live on different Windows drives).
pub fn to_executable_relative_path<P>(path: P) -> PathBuf
where
    P: AsRef<Path>,
{
    let normalized = normalize_path(path);
    if normalized.is_relative() {
        return normalized;
    }

    let executable_dir = get_executable_dir();
    diff_paths(&normalized, &executable_dir).unwrap_or(normalized)
}

/// Convert a path relative to the executable directory into an absolute path.
/// Absolute inputs are returned as-is after normalization.
pub fn to_executable_absolute_path<P>(path: P) -> PathBuf
where
    P: AsRef<Path>,
{
    let path = path.as_ref();
    if path.is_absolute() {
        return normalize_path(path);
    }

    let executable_dir = get_executable_dir();
    normalize_path(executable_dir.join(path))
}

fn diff_paths(path: &Path, base: &Path) -> Option<PathBuf> {
    let path_components: Vec<_> = path.components().collect();
    let base_components: Vec<_> = base.components().collect();

    if let (
        Some(Component::Prefix(path_prefix)),
        Some(Component::Prefix(base_prefix)),
    ) = (path_components.first(), base_components.first())
    {
        if path_prefix != base_prefix {
            return None;
        }
    } else if matches!(path_components.first(), Some(Component::Prefix(_)))
        || matches!(base_components.first(), Some(Component::Prefix(_)))
    {
        return None;
    }

    let mut i = 0;
    while i < path_components.len()
        && i < base_components.len()
        && path_components[i] == base_components[i]
    {
        i += 1;
    }

    let mut result = PathBuf::new();

    for component in &base_components[i..] {
        match component {
            Component::Normal(_) | Component::ParentDir => result.push(".."),
            Component::CurDir | Component::RootDir | Component::Prefix(_) => {}
        }
    }

    for component in &path_components[i..] {
        match component {
            Component::Normal(part) => result.push(part),
            Component::ParentDir => result.push(".."),
            Component::CurDir | Component::RootDir | Component::Prefix(_) => {}
        }
    }

    if result.as_os_str().is_empty() {
        Some(PathBuf::from("."))
    } else {
        Some(result)
    }
}

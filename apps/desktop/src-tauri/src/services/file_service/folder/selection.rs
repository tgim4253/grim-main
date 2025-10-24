use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::Path;

use crate::models::file::{FileType, FolderSelection};

#[derive(Default, Clone)]
pub(super) struct SelectionPlan {
    entries: HashMap<String, SelectionNode>,
}

#[derive(Clone, Default)]
pub(super) struct SelectionNode {
    pub(super) include: bool,
    pub(super) allowed_types: Option<HashSet<FileType>>,
}

impl SelectionPlan {
    pub(super) fn from_selection(selection: FolderSelection) -> Self {
        let mut entries = HashMap::new();
        for entry in selection.entries {
            let key = normalize_relative_key(&entry.relative_path);
            let allowed_types = entry
                .file_types
                .map(|types| types.into_iter().collect::<HashSet<FileType>>());
            entries.insert(
                key,
                SelectionNode { include: entry.include, allowed_types },
            );
        }

        SelectionPlan { entries }
    }

    pub(super) fn get(&self, key: &str) -> Option<&SelectionNode> {
        self.entries.get(key)
    }
}

pub(super) fn normalize_extension_list(list: Vec<String>) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut normalized = Vec::new();

    for value in list {
        let trimmed = value.trim().trim_start_matches('.').to_lowercase();
        if trimmed.is_empty() {
            continue;
        }
        if seen.insert(trimmed.clone()) {
            normalized.push(trimmed);
        }
    }

    normalized
}

pub(super) fn derive_root_extension_list(
    selection: Option<&SelectionPlan>,
) -> Option<Vec<String>> {
    let root = selection?.get("");
    let allowed = root?.allowed_types.as_ref()?;

    let mut set: BTreeSet<String> = BTreeSet::new();
    for file_type in allowed.iter() {
        for ext in file_type.extensions() {
            set.insert(ext.to_string());
        }
    }

    if set.is_empty() {
        None
    } else {
        Some(set.into_iter().collect())
    }
}

#[derive(Default, Clone)]
pub(super) struct ExtensionFilter {
    pub include: Option<HashSet<String>>,
    pub exclude: HashSet<String>,
}

impl ExtensionFilter {
    pub(super) fn new(include: &[String], exclude: &[String]) -> Self {
        let include = if include.is_empty() {
            None
        } else {
            Some(include.iter().cloned().collect())
        };

        let exclude = exclude.iter().cloned().collect();

        ExtensionFilter { include, exclude }
    }

    pub(super) fn allows(&self, path: &Path) -> bool {
        let ext = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.trim_start_matches('.').to_lowercase());

        if let Some(ref ext) = ext {
            if self.exclude.contains(ext) {
                return false;
            }

            if let Some(include) = &self.include {
                return include.contains(ext);
            }
        } else if self.include.is_some() {
            return false;
        }

        true
    }
}

pub(super) fn normalize_relative_key(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }

    let replaced = value.replace('\\', "/");
    let trimmed = replaced.trim_matches('/');
    if trimmed.is_empty() || trimmed == "." {
        String::new()
    } else {
        trimmed.to_string()
    }
}

pub(super) fn relative_path_key(root: &Path, current: &Path) -> String {
    if let Ok(relative) = current.strip_prefix(root) {
        if relative.as_os_str().is_empty() {
            return String::new();
        }
        return join_path_components(relative);
    }

    join_path_components(current)
}

fn join_path_components(path: &Path) -> String {
    path.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

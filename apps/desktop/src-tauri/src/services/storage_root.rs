use crate::models::file::OsPlatform;
use crate::utils::date::get_now_date;
use crate::utils::path_utils::normalize_path;
use chrono::{DateTime, Utc};
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "macos")]
use crate::models::file::StorageKind;
use crate::models::file::StorageRootInfo;
use anyhow::Result;

pub fn get_mount_paths() -> Result<Vec<PathBuf>> {
    let mps = mountpoints::mountpaths()?;

    Ok(mps)
}

pub fn enumerate_mounted_root() -> Result<Vec<StorageRootInfo>> {
    let mut roots = Vec::new();
    let now_s = get_now_date();

    #[cfg(target_os = "macos")]
    {
        let mount_paths = get_mount_paths()?;
        for mp in mount_paths {
            let mount_path_s = mp.to_string_lossy().to_string();
            let (device, fstype) = find_device_and_fstype(&mount_path_s);
            let (stable_id, secondary_id, label) = query_disk_ids(device.as_deref());
            let kind = classify_kind(&mp, &mp, device.as_deref(), fstype.as_deref());
            let is_available = mp.exists();

            roots.push(StorageRootInfo {
                platform: OsPlatform::Macos,
                kind,
                stable_id,
                secondary_id,
                label,
                is_available,
                mount_path: mount_path_s,
                updated_at: now_s.clone(),
                created_at: now_s.clone(),
            });
        }
    }

    Ok(roots)
}

#[cfg(target_os = "macos")]
pub fn detect_storage_root(path: &PathBuf) -> Result<StorageRootInfo> {
    let now: DateTime<Utc> = Utc::now();
    let now_s = now.to_rfc3339();

    let norm = normalize_path(&path.to_string_lossy());

    // --- find mount point (best prefix match) ---
    let mount_path = find_mount_point(&norm).unwrap_or_else(|| PathBuf::from("/"));
    let mount_path_s = mount_path.to_string_lossy().to_string();

    // --- read device + fstype via `mount` output ---
    let (device, fstype) = find_device_and_fstype(&mount_path_s);

    // --- query diskutil for stable identifiers ---
    let (stable_id, secondary_id, label) = query_disk_ids(device.as_deref());

    // --- classify kind ---
    let kind = classify_kind(&norm, &mount_path, device.as_deref(), fstype.as_deref());

    // --- availability (mount path exists and reachable) ---
    let is_available = mount_path.exists();

    Ok(StorageRootInfo {
        platform: OsPlatform::Macos,
        kind,
        stable_id,
        secondary_id,
        label,
        is_available,
        mount_path: mount_path_s,
        updated_at: now_s.clone(),
        created_at: now_s,
    })
}

#[cfg(not(target_os = "macos"))]
pub fn detect_storage_root(_path: &PathBuf) -> StorageRootInfo {
    // Fallback for non-macOS. You can add Windows/Linux later.
    let now: DateTime<Utc> = Utc::now();
    let now_s = now.to_rfc3339();
    StorageRootInfo {
        platform: OsPlatform::Other,
        kind: StorageKind::Other,
        stable_id: "unknown".into(),
        secondary_id: "".into(),
        label: "".into(),
        is_available: false,
        mount_path: "".into(),
        updated_at: now_s.clone(),
        created_at: now_s,
    }
}

#[cfg(target_os = "macos")]
fn find_mount_point(p: &Path) -> Option<PathBuf> {
    // Find the longest mount point that prefixes `p` by component boundary
    let mut best: Option<PathBuf> = None;
    if let Ok(mps) = get_mount_paths() {
        for mp in mps {
            // Component-aware check: either equal, or `p` starts with `m` + separator
            if p == mp
                || (p.starts_with(&mp) && {
                    // ensure boundary: p == m OR next component exists
                    let m_components = mp.components().count();
                    p.components().count() > m_components
                })
            {
                match &best {
                    Some(cur) if cur.as_os_str().len() >= mp.as_os_str().len() => {} // longest prefix
                    _ => best = Some(mp.to_path_buf()),
                }
            }
        }
    }
    // handling for Catalina+ data volume
    if best.as_deref() == Some(Path::new("/")) {
        if let Some(parent) = p.ancestors().find(|a| a == &Path::new("/System/Volumes/Data")) {
            return Some(parent.to_path_buf());
        }
    }
    best
}

#[cfg(target_os = "macos")]
fn find_device_and_fstype(mount_path: &str) -> (Option<String>, Option<String>) {
    // Parse `mount` output lines like:
    // "/dev/disk3s1s1 on / (apfs, local, read-only, journaled)"
    // "//user@server/share on /Volumes/share (smbfs, nodev, nosuid, mounted by alice)"
    let out = Command::new("mount").output().ok();
    if let Some(out) = out {
        if out.status.success() {
            if let Ok(text) = String::from_utf8(out.stdout) {
                for line in text.lines() {
                    // Must match " on {mount_path} ("
                    let needle = format!(" on {} (", mount_path);
                    if let Some(idx) = line.find(&needle) {
                        // device is before the first " on "
                        if let Some(on_idx) = line.find(" on ") {
                            let dev = line[..on_idx].trim().to_string();

                            // 'rest' should start with '('
                            let after = idx + needle.len() - 1; // -1 to point to '('
                            let mut rest = &line[after..];

                            rest = rest.trim_start();
                            if let Some(rp) = rest.strip_prefix('(') {
                                if let Some(end) = rp.find(',').or_else(|| rp.find(')')) {
                                    // apfs, autofs, msdos(fat12, fat16, fat32...), etc.
                                    let fs = rp[..end].trim().to_string();
                                    return (Some(dev), Some(fs));
                                }
                            }
                            return (Some(dev), None);
                        }
                    }
                }
            }
        }
    }
    (None, None)
}

#[cfg(target_os = "macos")]
fn query_disk_ids(device: Option<&str>) -> (String, String, String) {
    // Try `diskutil info -plist <device>` and extract:
    // - VolumeUUID or APFSVolumeUUID as stable_id
    // - DeviceIdentifier / DeviceNode as secondary_id
    // - VolumeName as label
    if let Some(dev) = device {
        // diskutil usually expects a device node like /dev/disk3s1s1 OR "disk3s1s1"
        let dev_arg = dev.trim();
        let output = Command::new("diskutil").args(["info", "-plist", dev_arg]).output();

        if let Ok(out) = output {
            if out.status.success() {
                // plist crate can parse XML property lists
                //ex)
                //  <key>DeviceIdentifier</key>
                //  <string>disk3s5</string>
                if let Ok(value) = plist::Value::from_reader_xml(out.stdout.as_slice()) {
                    // helper to get string
                    let get_s = |k: &str| -> Option<String> {
                        value
                            .as_dictionary()
                            .and_then(|d| d.get(k))
                            .and_then(|v| v.as_string())
                            .map(|s| s.to_string())
                    };
                    // candidates for stable id (prefer volume uuid)
                    let stable = get_s("VolumeUUID")
                        .or_else(|| get_s("APFSVolumeUUID"))
                        .or_else(|| get_s("MediaUUID"))
                        .unwrap_or_else(|| dev_arg.to_string());

                    //<string>disk3s5</string>
                    let secondary = get_s("DeviceIdentifier")
                        .or_else(|| get_s("DeviceNode"))
                        .unwrap_or_else(|| dev_arg.to_string());

                    let label = get_s("VolumeName")
                        .or_else(|| Some(format!("Unknown - {}", secondary)))
                        .unwrap_or_default();

                    return (stable, secondary, label);
                }
            }
        }
        // Fallback if diskutil didn't work
        return (dev_arg.to_string(), dev_arg.to_string(), String::new());
    }
    // No device known: return generic IDs
    ("unknown".into(), "".into(), "".into())
}

#[cfg(target_os = "macos")]
fn classify_kind(
    norm: &std::path::Path,
    mount_path: &std::path::Path,
    device: Option<&str>,
    fstype: Option<&str>,
) -> StorageKind {
    use std::path::Path;

    // --- 0) Helpers ---
    // Normalize lowercase fs string once
    let fs_lc = fstype.map(|s| s.to_ascii_lowercase());
    let dev = device.unwrap_or("");

    // Helper: known URL-like network specifiers
    let is_network_device = {
        // Examples: //user@host/share, smb://..., afp://..., nfs://..., webdav://...
        let d = dev.to_ascii_lowercase();
        d.starts_with("//")
            || d.starts_with("smb://")
            || d.starts_with("afp://")
            || d.starts_with("nfs://")
            || d.starts_with("webdav://")
            || d.starts_with("cifs://")
            // sshfs can appear via macFUSE; device may look like "sshfs#user@host:..."
            || d.starts_with("sshfs#")
    };

    // --- 1) Network / Virtual by fs type or device syntax ---
    if let Some(ref fs) = fs_lc {
        // Common network filesystems on macOS
        if matches!(
            fs.as_str(),
            "smbfs" | "afpfs" | "nfs" | "webdav" | "webdavfs" | "cifs" | "sshfs"
        ) {
            return StorageKind::Network;
        }
        // FUSE is a mixed bag: sshfs is network; others are usually virtual
        if fs.contains("fuse") {
            if dev.to_ascii_lowercase().contains("sshfs") {
                return StorageKind::Network;
            }
            return StorageKind::Virtual;
        }
        // autofs/devfs are virtual
        if fs == "autofs" || fs == "devfs" {
            return StorageKind::Virtual;
        }
    }
    if is_network_device {
        return StorageKind::Network;
    }

    // --- 2) Internal: system roots or user's home / iCloud Drive ---
    if mount_path == Path::new("/")
        || mount_path == Path::new("/System/Volumes/Data")
        || mount_path == Path::new("/System/Volumes/Preboot")
        || mount_path == Path::new("/System/Volumes/VM")
        || mount_path == Path::new("/System/Volumes/Update")
        || mount_path == Path::new("/System/Volumes/iSCPreboot")
    {
        return StorageKind::Internal;
    }
    if let Some(home) = dirs_next::home_dir() {
        // Treat anything under the user's Home as Internal (incl. iCloud Drive)
        let icloud_docs = home.join("Library/Mobile Documents/com~apple~CloudDocs");
        if norm.starts_with(&home) || norm.starts_with(&icloud_docs) {
            return StorageKind::Internal;
        }
    }

    // --- 3) External: typical removable media under /Volumes/<Name> ---
    if mount_path.starts_with(Path::new("/Volumes")) {
        // Heuristic: Boot Camp (NTFS) on the internal disk is often /dev/disk0s*
        // If device path hints clearly at the internal physical disk, bias to Internal.
        // (Still a heuristic; diskutil(8) would be more authoritative.)
        if dev.starts_with("/dev/disk0") {
            return StorageKind::Internal;
        }
        return StorageKind::External;
    }

    // --- 4) Fallback heuristics by fs type ---
    if let Some(ref fs) = fs_lc {
        // Common local filesystems; when unsure, default to Internal
        if fs.contains("apfs")
            || fs.contains("hfs")     // covers "hfs", "hfs+"
            || fs.contains("msdos")   // "msdos", "msdosfs"
            || fs.contains("exfat")
            || fs == "ntfs"
        // Boot Camp mounted atypically
        {
            return StorageKind::Internal;
        }
    }

    // --- 5) Unknown as last resort ---
    StorageKind::Unknown
}

//! Cross-platform helpers for storage root discovery and classification.

use crate::db::repository::sroot_repository::SrootRepository;
use crate::models::file::{StorageKind, StorageRootInfo};
use crate::services::file_service::ensure_real_folder;
use crate::utils::date::get_now_date;
use crate::utils::path_utils::normalize_path;
use crate::utils::platform::get_current_platfrom;
use anyhow::Result;
use sqlx::{Sqlite, Transaction};
use std::path::PathBuf;

/// Re-export platform-specific helpers behind a single interface.
#[cfg(target_os = "macos")]
mod platform_impl {
    use super::*;
    use std::path::Path;
    use std::process::Command;

    /// Find the mount point that best (longest) prefixes `p`.
    /// Includes special handling for Catalina+ Data volume.
    pub fn find_mount_point(p: &Path) -> Option<PathBuf> {
        let mut best: Option<PathBuf> = None;
        if let Ok(mps) = crate::services::storage_root::get_mount_paths() {
            for mp in mps {
                if p == mp
                    || (p.starts_with(&mp) && {
                        let m_components = mp.components().count();
                        p.components().count() > m_components
                    })
                {
                    match &best {
                        Some(cur)
                            if cur.as_os_str().len()
                                >= mp.as_os_str().len() => {}
                        _ => best = Some(mp.to_path_buf()),
                    }
                }
            }
        }
        // Handle Catalina+ Data volume when best is "/"
        if best.as_deref() == Some(Path::new("/")) {
            if let Some(parent) =
                p.ancestors().find(|a| a == &Path::new("/System/Volumes/Data"))
            {
                return Some(parent.to_path_buf());
            }
        }
        best
    }

    /// Parse `mount` output to find (device, fstype) for a given mount path.
    pub fn find_device_and_fstype(
        mount_path: &str,
    ) -> (Option<String>, Option<String>) {
        // Example lines:
        // "/dev/disk3s1s1 on / (apfs, local, read-only, journaled)"
        // "//user@server/share on /Volumes/share (smbfs, nodev, nosuid, mounted by alice)"
        if let Ok(out) = Command::new("mount").output() {
            if out.status.success() {
                if let Ok(text) = String::from_utf8(out.stdout) {
                    for line in text.lines() {
                        let needle = format!(" on {} (", mount_path);
                        if let Some(idx) = line.find(&needle) {
                            if let Some(on_idx) = line.find(" on ") {
                                let dev = line[..on_idx].trim().to_string();

                                let after = idx + needle.len() - 1; // point to '('
                                let mut rest = &line[after..];
                                rest = rest.trim_start();
                                if let Some(rp) = rest.strip_prefix('(') {
                                    if let Some(end) =
                                        rp.find(',').or_else(|| rp.find(')'))
                                    {
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

    /// Query stable/secondary IDs and a human label via `diskutil`.
    pub fn query_disk_ids(device: Option<&str>) -> (String, String, String) {
        if let Some(dev) = device {
            let dev_arg = dev.trim();
            if let Ok(out) = std::process::Command::new("diskutil")
                .args(["info", "-plist", dev_arg])
                .output()
            {
                if out.status.success() {
                    if let Ok(value) =
                        plist::Value::from_reader_xml(out.stdout.as_slice())
                    {
                        let get_s = |k: &str| -> Option<String> {
                            value
                                .as_dictionary()
                                .and_then(|d| d.get(k))
                                .and_then(|v| v.as_string())
                                .map(|s| s.to_string())
                        };
                        let stable = get_s("VolumeUUID")
                            .or_else(|| get_s("APFSVolumeUUID"))
                            .or_else(|| get_s("MediaUUID"))
                            .unwrap_or_else(|| dev_arg.to_string());
                        let secondary = get_s("DeviceIdentifier")
                            .or_else(|| get_s("DeviceNode"))
                            .unwrap_or_else(|| dev_arg.to_string());
                        let label = get_s("VolumeName").unwrap_or_else(|| {
                            format!("Unknown - {}", secondary)
                        });
                        return (stable, secondary, label);
                    }
                }
            }
            // Fallback when `diskutil` fails
            return (dev_arg.to_string(), dev_arg.to_string(), String::new());
        }
        ("unknown".into(), "".into(), "".into())
    }

    /// Classify storage kind using macOS-specific heuristics.
    pub fn classify_kind(
        norm: &Path,
        mount_path: &Path,
        device: Option<&str>,
        fstype: Option<&str>,
    ) -> StorageKind {
        use std::path::Path;

        let fs_lc = fstype.map(|s| s.to_ascii_lowercase());
        let dev = device.unwrap_or("");

        // URL-like network device?
        let is_network_device = {
            let d = dev.to_ascii_lowercase();
            d.starts_with("//")
                || d.starts_with("smb://")
                || d.starts_with("afp://")
                || d.starts_with("nfs://")
                || d.starts_with("webdav://")
                || d.starts_with("cifs://")
                || d.starts_with("sshfs#")
        };

        // Network / Virtual by fs type or device syntax
        if let Some(ref fs) = fs_lc {
            if matches!(
                fs.as_str(),
                "smbfs"
                    | "afpfs"
                    | "nfs"
                    | "webdav"
                    | "webdavfs"
                    | "cifs"
                    | "sshfs"
            ) {
                return StorageKind::Network;
            }
            if fs.contains("fuse") {
                if dev.to_ascii_lowercase().contains("sshfs") {
                    return StorageKind::Network;
                }
                return StorageKind::Virtual;
            }
            if fs == "autofs" || fs == "devfs" {
                return StorageKind::Virtual;
            }
        }
        if is_network_device {
            return StorageKind::Network;
        }

        // Internal: system roots or user's home/iCloud Drive
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
            let icloud_docs =
                home.join("Library/Mobile Documents/com~apple~CloudDocs");
            if norm.starts_with(&home) || norm.starts_with(&icloud_docs) {
                return StorageKind::Internal;
            }
        }

        // External: typical removable media under /Volumes/*
        if mount_path.starts_with(Path::new("/Volumes")) {
            if dev.starts_with("/dev/disk0") {
                return StorageKind::Internal;
            }
            return StorageKind::External;
        }

        // Fallback by fs type
        if let Some(ref fs) = fs_lc {
            if fs.contains("apfs")
                || fs.contains("hfs")
                || fs.contains("msdos")
                || fs.contains("exfat")
                || fs == "ntfs"
            {
                return StorageKind::Internal;
            }
        }

        StorageKind::Unknown
    }
}

#[cfg(target_os = "windows")]
mod platform_impl {
    use super::*;
    use std::ffi::{OsStr, OsString};
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        GetDriveTypeW, GetVolumeInformationW,
        GetVolumeNameForVolumeMountPointW, GetVolumePathNameW, QueryDosDeviceW,
    };
    use windows::Win32::System::WindowsProgramming::{
        DRIVE_CDROM, DRIVE_FIXED, DRIVE_RAMDISK, DRIVE_REMOTE, DRIVE_REMOVABLE,
    };

    // ---------- UTF-16 helpers (Windows-only) ----------
    fn to_utf16_nul(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }
    fn os_to_utf16_nul(s: &OsStr) -> Vec<u16> {
        s.encode_wide().chain(std::iter::once(0)).collect()
    }
    fn utf16_buf_to_string(buf: &[u16]) -> Option<String> {
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        if end == 0 {
            None
        } else {
            Some(
                OsString::from_wide(&buf[..end]).to_string_lossy().into_owned(),
            )
        }
    }

    /// Try to resolve the mount point for `p` using WinAPI; fall back to drive prefix.
    pub fn find_mount_point(p: &Path) -> Option<PathBuf> {
        let w_path = os_to_utf16_nul(p.as_os_str());
        let mut out = vec![0u16; 32_768];
        let ok = unsafe {
            GetVolumePathNameW(PCWSTR(w_path.as_ptr()), &mut out).is_ok()
        };
        if ok {
            if let Some(os) = utf16_buf_to_string(&out) {
                if !os.is_empty() {
                    return Some(PathBuf::from(os));
                }
            }
        }

        // Fallback: derive from drive prefix if present
        p.components().next().and_then(|c| match c {
            std::path::Component::Prefix(prefix) => {
                use std::path::Prefix::*;
                match prefix.kind() {
                    Disk(d) | VerbatimDisk(d) => {
                        let letter = (d as char).to_ascii_uppercase();
                        Some(PathBuf::from(format!("{letter}:\\")))
                    }
                    _ => None,
                }
            }
            _ => None,
        })
    }

    /// Resolve a root path usable by Win32 APIs from an input path/device.
    fn resolve_root(input: &str) -> Option<String> {
        if input.starts_with(r"\\?\Volume{") {
            let mut s = input.to_string();
            if !s.ends_with('\\') {
                s.push('\\');
            }
            return Some(s);
        }
        let in_w = to_utf16_nul(input);
        let mut root_w: Vec<u16> = vec![0u16; 260];
        let ok = unsafe {
            GetVolumePathNameW(PCWSTR(in_w.as_ptr()), &mut root_w).is_ok()
        };
        if ok {
            if let Some(mut root) = utf16_buf_to_string(&root_w) {
                if !root.ends_with('\\') {
                    root.push('\\');
                }
                return Some(root);
            }
        }
        // Heuristics
        if input.len() == 2 && input.as_bytes()[1] == b':' {
            return Some(format!("{}\\", input));
        }
        if input.ends_with('\\')
            && (input.contains(':') || input.starts_with(r"\\"))
        {
            return Some(input.to_string());
        }
        let mut s = input.to_string();
        if !s.ends_with('\\') {
            s.push('\\');
        }
        Some(s)
    }

    /// Return (device, fstype) for a mount path.
    pub fn find_device_and_fstype(
        mount_path: &str,
    ) -> (Option<String>, Option<String>) {
        // 1) Resolve volume root (e.g., "C:\", "\\server\share\")
        let path_w = to_utf16_nul(mount_path);
        let mut root_buf: Vec<u16> = vec![0u16; 260];
        let ok = unsafe {
            GetVolumePathNameW(PCWSTR(path_w.as_ptr()), &mut root_buf).is_ok()
        };
        if !ok {
            return (None, None);
        }
        let root_str = match utf16_buf_to_string(&root_buf) {
            Some(s) => s,
            None => return (None, None),
        };

        // 2) Try Volume GUID path (local volumes)
        let mut guid_buf: Vec<u16> = vec![0u16; 260];
        let root_w = to_utf16_nul(&root_str);
        let ok_guid = unsafe {
            GetVolumeNameForVolumeMountPointW(
                PCWSTR(root_w.as_ptr()),
                &mut guid_buf,
            )
        }
        .is_ok();
        let device = if ok_guid {
            utf16_buf_to_string(&guid_buf).or_else(|| Some(root_str.clone()))
        } else {
            Some(root_str.clone())
        };

        // 3) Query filesystem type
        let mut volume_name_buf = [0u16; 256];
        let mut fs_name_buf = [0u16; 256];
        let mut serial: u32 = 0;
        let mut max_comp_len: u32 = 0;
        let mut fs_flags: u32 = 0;
        let ok_fs = unsafe {
            GetVolumeInformationW(
                PCWSTR(path_w.as_ptr()),
                Some(&mut volume_name_buf),
                Some(&mut serial),
                Some(&mut max_comp_len),
                Some(&mut fs_flags),
                Some(&mut fs_name_buf),
            )
            .is_ok()
        };
        let fstype =
            if ok_fs { utf16_buf_to_string(&fs_name_buf) } else { None };

        (device, fstype)
    }

    /// Query stable/secondary IDs and label using WinAPI.
    pub fn query_disk_ids(device: Option<&str>) -> (String, String, String) {
        if let Some(dev) = device {
            let dev_arg = dev.trim();
            let Some(root) = resolve_root(dev_arg) else {
                return (
                    dev_arg.to_string(),
                    dev_arg.to_string(),
                    String::new(),
                );
            };

            // Prefer Volume GUID path if available (local volumes)
            let mut guid_w: Vec<u16> = vec![0u16; 260];
            let root_w = to_utf16_nul(&root);
            let ok_guid = unsafe {
                GetVolumeNameForVolumeMountPointW(
                    PCWSTR(root_w.as_ptr()),
                    &mut guid_w,
                )
            }
            .is_ok();
            let stable = if ok_guid {
                utf16_buf_to_string(&guid_w).unwrap_or_else(|| root.clone())
            } else {
                root.clone()
            };

            // Secondary: for drive letters resolve DOS device mapping; otherwise use root
            let secondary = if root.len() >= 3
                && root.as_bytes()[1] == b':'
                && (root.as_bytes()[2] == b'\\' || root.as_bytes()[2] == b'/')
            {
                let dos = format!("{}:", root.chars().next().unwrap());
                let dos_w = to_utf16_nul(&dos);
                let mut map_w: Vec<u16> = vec![0u16; 32768];
                let n = unsafe {
                    QueryDosDeviceW(PCWSTR(dos_w.as_ptr()), Some(&mut map_w))
                };
                if n != 0 {
                    utf16_buf_to_string(&map_w).unwrap_or_else(|| root.clone())
                } else {
                    root.clone()
                }
            } else {
                root.clone()
            };

            // Volume label
            let mut volname_w: Vec<u16> = vec![0u16; 260];
            let mut fsname_w: Vec<u16> = vec![0u16; 64];
            let mut serial: u32 = 0;
            let mut max_comp_len: u32 = 0;
            let mut fs_flags: u32 = 0;
            let ok_info = unsafe {
                GetVolumeInformationW(
                    PCWSTR(root_w.as_ptr()),
                    Some(&mut volname_w),
                    Some(&mut serial),
                    Some(&mut max_comp_len),
                    Some(&mut fs_flags),
                    Some(&mut fsname_w),
                )
                .is_ok()
            };

            let fstype =
                if ok_info { utf16_buf_to_string(&fsname_w) } else { None };

            // todo: label always return error. windows
            let label = if ok_info {
                utf16_buf_to_string(&volname_w).unwrap_or_else(|| {
                    format!("Unknown-{}", fstype.unwrap_or("".into()))
                })
            } else {
                format!("Unknown-{}", fstype.unwrap_or("".into()))
            };

            return (stable, secondary, label);
        }
        ("unknown".into(), "".into(), "".into())
    }

    /// Classify storage kind using Windows-specific heuristics.
    pub fn classify_kind(
        norm: &Path,
        mount_path: &Path,
        device: Option<&str>,
        fstype: Option<&str>,
    ) -> StorageKind {
        let root_w = to_utf16_nul(&mount_path.to_string_lossy());
        let drive_type = unsafe { GetDriveTypeW(PCWSTR(root_w.as_ptr())) };
        match drive_type {
            DRIVE_REMOVABLE => return StorageKind::External,
            DRIVE_FIXED => {
                if mount_path.to_string_lossy().starts_with(r"\\") {
                    return StorageKind::Network;
                }
                return StorageKind::Internal;
            }
            DRIVE_REMOTE => return StorageKind::Network,
            DRIVE_RAMDISK => return StorageKind::Virtual,
            _ => {} // DRIVE_UNKNOWN, DRIVE_NO_ROOT_DIR
        }

        // Fallback based on device and fstype
        let fs_lc = fstype.map(|s| s.to_ascii_lowercase());
        let dev = device.unwrap_or("");

        if let Some(ref fs) = fs_lc {
            if matches!(
                fs.as_str(),
                "cifs" | "nfs" | "smb" | "webdav" | "sshfs" | "fuse"
            ) {
                return StorageKind::Network;
            }
            if fs.contains("virtual") || fs.contains("ramdisk") {
                return StorageKind::Virtual;
            }
        }

        if dev.starts_with(r"\\") || dev.contains(":") && dev.contains(r"\") {
            return StorageKind::Network;
        }

        StorageKind::Unknown
    }
}

// Pull the OS-specific symbols into scope
#[cfg(any(target_os = "macos", target_os = "windows"))]
use platform_impl::{
    classify_kind, find_device_and_fstype, find_mount_point, query_disk_ids,
};

/// Enumerate currently mounted paths on the host platform.
pub fn get_mount_paths() -> Result<Vec<PathBuf>> {
    let mps = mountpoints::mountpaths()?;
    Ok(mps)
}

/// Gather metadata for each mounted storage root.
pub fn enumerate_mounted_root() -> Result<Vec<StorageRootInfo>> {
    let mut roots = Vec::new();
    let now_s = get_now_date();

    let mount_paths = get_mount_paths()?;
    for mp in mount_paths {
        let mount_path_s = mp.to_string_lossy().to_string();

        // (device, fstype) per mount
        let (device, fstype) = find_device_and_fstype(&mount_path_s);

        // Stable/secondary IDs and label
        let (stable_id, secondary_id, label) =
            query_disk_ids(device.as_deref());

        // Classify kind
        let kind =
            classify_kind(&mp, &mp, device.as_deref(), fstype.as_deref());

        // Availability
        let is_available = mp.exists();

        roots.push(StorageRootInfo {
            platform: get_current_platfrom(),
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

    Ok(roots)
}

/// Detect the storage root that contains the provided filesystem path.
pub fn detect_storage_root(path: &PathBuf) -> Result<StorageRootInfo> {
    let now_s = get_now_date();
    let norm = normalize_path(path);

    // Best-prefix mount point
    let mount_path =
        find_mount_point(&norm).unwrap_or_else(|| PathBuf::from("/"));
    let mount_path_s = mount_path.to_string_lossy().to_string();

    // (device, fstype) via system query
    let (device, fstype) = find_device_and_fstype(&mount_path_s);

    // Stable IDs / label
    let (stable_id, secondary_id, label) = query_disk_ids(device.as_deref());

    // Kind
    let kind =
        classify_kind(&norm, &mount_path, device.as_deref(), fstype.as_deref());

    // Availability
    let is_available = mount_path.exists();

    Ok(StorageRootInfo {
        platform: get_current_platfrom(),
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

/// Ensure storage-root and real-folder records exist for the provided path.
pub async fn ensure_storage_root_and_real_folder(
    tx: &mut Transaction<'_, Sqlite>,
    sroot_info: &StorageRootInfo,
    norm_path: &PathBuf,
) -> Result<String> {
    // Ensure StorageRoot exists or create it
    let sroot_id =
        SrootRepository::ensure_storage_root(tx.as_mut(), sroot_info).await?;

    // Ensure RealFolder exists or create it
    let real_folder_id =
        ensure_real_folder(tx, sroot_id.clone(), norm_path).await?;

    Ok(real_folder_id)
}

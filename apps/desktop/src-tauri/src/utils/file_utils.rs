use std::{fs, path::Path};

use anyhow::Result;

/// Guess a MIME type based on the file extension, defaulting to octet-stream.
pub fn guess_mime(path: &Path) -> String {
    let ext =
        path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();

    match ext.as_str() {
        // Images
        "jpg" | "jpeg" => "image/jpeg".into(),
        "png" => "image/png".into(),
        "gif" => "image/gif".into(),
        "bmp" => "image/bmp".into(),
        "tiff" | "tif" => "image/tiff".into(),
        "webp" => "image/webp".into(),
        "heic" => "image/heic".into(),

        // Video
        "mp4" => "video/mp4".into(),
        "mov" => "video/quicktime".into(),
        "avi" => "video/x-msvideo".into(),
        "mkv" => "video/x-matroska".into(),
        "webm" => "video/webm".into(),
        "flv" => "video/x-flv".into(),
        "wmv" => "video/x-ms-wmv".into(),

        // Audio
        "mp3" => "audio/mpeg".into(),
        "wav" => "audio/wav".into(),
        "flac" => "audio/flac".into(),
        "aac" => "audio/aac".into(),
        "ogg" => "audio/ogg".into(),
        "m4a" => "audio/mp4".into(),

        // Documents
        "pdf" => "application/pdf".into(),
        "txt" => "text/plain".into(),
        "md" => "text/markdown".into(),
        "html" | "htm" => "text/html".into(),
        "csv" => "text/csv".into(),

        "doc" => "application/msword".into(),
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document".into(),
        "xls" => "application/vnd.ms-excel".into(),
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".into(),
        "ppt" => "application/vnd.ms-powerpoint".into(),
        "pptx" => {
            "application/vnd.openxmlformats-officedocument.presentationml.presentation".into()
        }
        "odt" => "application/vnd.oasis.opendocument.text".into(),

        // Archives
        "zip" => "application/zip".into(),
        "rar" => "application/vnd.rar".into(),
        "7z" => "application/x-7z-compressed".into(),
        "tar" => "application/x-tar".into(),
        "gz" => "application/gzip".into(),

        // Graphic tools
        "psd" => "image/vnd.adobe.photoshop".into(), // Photoshop
        "ai" => "application/postscript".into(),     // Illustrator
        "xd" => "application/vnd.adobe.xd".into(),   // Adove XD
        "fig" => "application/octet-stream".into(),  // Figma
        "clip" => "application/octet-stream".into(), // Clip Studio
        "kra" => "application/x-krita".into(),       // Krita
        "sai" => "application/octet-stream".into(),  // Paint Tool SAI
        "pur" => "application/octet-stream".into(),  // PureRef

        // Default
        _ => "application/octet-stream".into(),
    }
}

/// Convert a file modification time into Unix epoch seconds.
pub fn file_mtime_epoch(meta: &fs::Metadata) -> Result<i64> {
    let modified = meta.modified()?;
    let duration = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(std::io::Error::other)?;
    Ok(duration.as_secs() as i64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::Path,
        time::{Duration, SystemTime},
    };

    use filetime::{set_file_mtime, FileTime};
    use tempfile::NamedTempFile;

    #[test]
    fn guess_mime_handles_common_extensions() {
        assert_eq!(guess_mime(Path::new("photo.jpg")), "image/jpeg");
        assert_eq!(guess_mime(Path::new("video.mp4")), "video/mp4");
        assert_eq!(
            guess_mime(Path::new("unknown.xyz")),
            "application/octet-stream"
        );
    }

    #[test]
    fn file_mtime_epoch_matches_set_timestamp() -> anyhow::Result<()> {
        let temp_file = NamedTempFile::new()?;
        let target_time =
            SystemTime::UNIX_EPOCH + Duration::from_secs(1_700_000_000);
        set_file_mtime(
            temp_file.path(),
            FileTime::from_system_time(target_time),
        )?;

        let metadata = fs::metadata(temp_file.path())?;
        let epoch = file_mtime_epoch(&metadata)?;

        assert_eq!(epoch, 1_700_000_000);

        Ok(())
    }
}

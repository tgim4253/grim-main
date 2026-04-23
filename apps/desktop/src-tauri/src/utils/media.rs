use std::{
    hash::Hasher,
    path::{Path, PathBuf},
};

use anyhow::{anyhow, bail, Context, Result};
use fast_image_resize::{
    images::Image, FilterType, PixelType, ResizeAlg, ResizeOptions, Resizer,
};
use image::{DynamicImage, GenericImageView};
use tokio::{fs, io::AsyncReadExt, io::BufReader, task};
use twox_hash::XxHash64;

use crate::utils::file_utils::guess_mime;

pub const SUPPORTED_IMAGE_EXTENSIONS: &[&str] =
    &["png", "jpg", "jpeg", "webp", "bmp", "gif", "tif", "tiff"];

pub fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .map(|value| SUPPORTED_IMAGE_EXTENSIONS.contains(&value.as_str()))
        .unwrap_or(false)
}

pub async fn hash_file(path: &Path) -> Result<String> {
    let file = fs::File::open(path)
        .await
        .with_context(|| format!("Failed to open {}", path.display()))?;
    let mut reader = BufReader::new(file);
    let mut hasher = XxHash64::default();
    let mut buffer = [0u8; 8192];

    loop {
        let read = reader.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        hasher.write(&buffer[..read]);
    }

    Ok(format!("{:016x}", hasher.finish()))
}

pub fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = XxHash64::default();
    hasher.write(bytes);
    format!("{:016x}", hasher.finish())
}

pub async fn image_dimensions(path: &Path) -> Result<(u32, u32)> {
    let owned = path.to_path_buf();
    task::spawn_blocking(move || {
        image::image_dimensions(&owned).map_err(anyhow::Error::from)
    })
    .await
    .map_err(|err| anyhow!("Failed to join image dimension task: {err}"))?
}

pub async fn persist_bytes(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::write(path, bytes).await?;
    Ok(())
}

pub async fn copy_file(source: &Path, destination: &Path) -> Result<()> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::copy(source, destination).await.with_context(|| {
        format!(
            "Failed to copy {} to {}",
            source.display(),
            destination.display()
        )
    })?;
    Ok(())
}

pub async fn ensure_thumbnail(
    source_path: &Path,
    thumbnail_path: &Path,
) -> Result<(u32, u32)> {
    if fs::metadata(thumbnail_path).await.is_ok() {
        return image_dimensions(thumbnail_path).await;
    }

    let data = fs::read(source_path).await.with_context(|| {
        format!("Failed to read source image {}", source_path.display())
    })?;

    let image: DynamicImage = task::spawn_blocking({
        let data = data.clone();
        move || image::load_from_memory(&data).context("image decode failed")
    })
    .await
    .map_err(|err| anyhow!("Failed to join image decode task: {err}"))??;

    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        bail!("Invalid image dimensions: {}x{}", width, height);
    }

    let target_width = 512_u32.min(width.max(1));
    let scale = target_width as f32 / width as f32;
    let target_height = ((height as f32 * scale).round() as u32).max(1);

    let rgba = image.to_rgba8();
    let (src_w, src_h) = rgba.dimensions();
    let src_image =
        Image::from_vec_u8(src_w, src_h, rgba.into_raw(), PixelType::U8x4)
            .expect("invalid source image");
    let mut dst_image =
        Image::new(target_width, target_height, src_image.pixel_type());

    let mut resizer = Resizer::new();
    resizer
        .resize(
            &src_image,
            &mut dst_image,
            &ResizeOptions::new()
                .resize_alg(ResizeAlg::Convolution(FilterType::CatmullRom)),
        )
        .expect("resize failed");

    let encoded = task::spawn_blocking({
        let buffer = dst_image.into_vec();
        move || -> Result<Vec<u8>> {
            let mut rgb = Vec::with_capacity(
                (target_width as usize) * (target_height as usize) * 3,
            );
            for pixel in buffer.chunks_exact(4) {
                rgb.extend_from_slice(&[pixel[0], pixel[1], pixel[2]]);
            }

            let mut output = Vec::new();
            let mut encoder =
                image::codecs::jpeg::JpegEncoder::new_with_quality(
                    &mut output,
                    75,
                );
            encoder
                .encode(
                    &rgb,
                    target_width,
                    target_height,
                    image::ExtendedColorType::Rgb8,
                )
                .context("jpeg encode failed")?;
            Ok(output)
        }
    })
    .await
    .map_err(|err| anyhow!("Failed to join image encode task: {err}"))??;

    persist_bytes(thumbnail_path, &encoded).await?;

    Ok((target_width, target_height))
}

pub fn target_asset_path(
    root: &Path,
    hash: &str,
    source_path: &Path,
) -> PathBuf {
    let mut destination = root.join(hash);
    if let Some(ext) = source_path.extension().and_then(|value| value.to_str())
    {
        destination.set_extension(ext.to_ascii_lowercase());
    }
    destination
}

pub fn thumbnail_path(root: &Path, hash: &str) -> PathBuf {
    let mut path = root.join(hash);
    path.set_extension("jpg");
    path
}

pub fn source_mime(path: &Path) -> String {
    guess_mime(path)
}

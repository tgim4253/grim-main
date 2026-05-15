use std::{borrow::Cow, path::Path};

use anyhow::{bail, Context, Result};

use crate::errors::{CommandResult, IntoCommandResult};

#[tauri::command]
pub async fn copy_image_to_clipboard(
    path: String,
    grayscale: bool,
) -> CommandResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        copy_image_path_to_clipboard(Path::new(&path), grayscale)
    })
    .await
    .map_err(|error| error.to_string())?
    .into_command()
}

fn copy_image_path_to_clipboard(path: &Path, grayscale: bool) -> Result<()> {
    if !path.is_file() {
        bail!("Image file does not exist: {}", path.display());
    }

    let mut image = image::ImageReader::open(path)
        .with_context(|| {
            format!("Failed to open image for clipboard: {}", path.display())
        })?
        .with_guessed_format()
        .with_context(|| {
            format!(
                "Failed to detect image format for clipboard: {}",
                path.display()
            )
        })?
        .decode()
        .with_context(|| {
            format!("Failed to decode image for clipboard: {}", path.display())
        })?
        .to_rgba8();

    if grayscale {
        apply_grayscale_filter(&mut image);
    }

    let (width, height) = image.dimensions();
    let image_data = arboard::ImageData {
        width: usize::try_from(width)
            .context("Image width is too large for clipboard")?,
        height: usize::try_from(height)
            .context("Image height is too large for clipboard")?,
        bytes: Cow::Owned(image.into_raw()),
    };

    let mut clipboard = arboard::Clipboard::new()
        .context("Failed to access system clipboard")?;
    clipboard
        .set_image(image_data)
        .context("Failed to copy image to clipboard")?;

    Ok(())
}

fn apply_grayscale_filter(image: &mut image::RgbaImage) {
    for pixel in image.pixels_mut() {
        let [red, green, blue, alpha] = pixel.0;
        let grayscale = ((u32::from(red) * 299
            + u32::from(green) * 587
            + u32::from(blue) * 114
            + 500)
            / 1000) as u8;

        pixel.0 = [grayscale, grayscale, grayscale, alpha];
    }
}

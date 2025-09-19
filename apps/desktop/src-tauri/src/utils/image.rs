use image::DynamicImage;

/// Determine whether the provided image is backed by an RGBA8 buffer.
fn is_rgba8(img: &DynamicImage) -> bool {
    matches!(img, DynamicImage::ImageRgba8(_))
}

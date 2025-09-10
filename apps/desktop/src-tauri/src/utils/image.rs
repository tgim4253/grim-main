use image::DynamicImage;

fn is_rgba8(img: &DynamicImage) -> bool {
    matches!(img, DynamicImage::ImageRgba8(_))
}

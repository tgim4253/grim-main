use std::{
    ffi::OsString,
    fs::File,
    io::BufWriter,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::{anyhow, bail, Context, Result};
use image::{
    codecs::png::{CompressionType, FilterType as PngFilterType, PngEncoder},
    imageops, ColorType, ImageEncoder, Rgba, RgbaImage,
};
use tracing::info;

use crate::models::record::{
    RecordExportGridLayoutConfig, RecordExportImageConfig,
    RecordExportPairLayoutConfig,
};

const MAX_CANVAS_PIXELS: u64 = 80_000_000;
const MAX_CANVAS_DIMENSION: u32 = 100_000;

#[derive(Debug, Clone)]
pub struct RecordExportInput {
    pub record_id: String,
    pub source_path: PathBuf,
    pub result_path: PathBuf,
}

#[derive(Debug, Clone, Copy)]
struct Size {
    width: u32,
    height: u32,
}

#[derive(Debug, Clone)]
struct ImageBox {
    path: PathBuf,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone)]
struct PairBlock {
    width: u32,
    height: u32,
    source: ImageBox,
    result: ImageBox,
}

#[derive(Debug, Clone)]
struct PlacedBlock {
    x: u32,
    y: u32,
    block: PairBlock,
}

#[derive(Debug, Clone)]
struct FinalLayout {
    width: u32,
    height: u32,
    blocks: Vec<PlacedBlock>,
}

pub async fn render_record_export(
    records: Vec<RecordExportInput>,
    pair_layout: RecordExportPairLayoutConfig,
    grid_layout: RecordExportGridLayoutConfig,
    output_directory: PathBuf,
    file_name: Option<String>,
) -> Result<PathBuf> {
    tauri::async_runtime::spawn_blocking(move || {
        render_record_export_sync(
            records,
            pair_layout,
            grid_layout,
            output_directory,
            file_name,
        )
    })
    .await
    .map_err(|error| anyhow!("record export worker failed: {error}"))?
}

fn render_record_export_sync(
    records: Vec<RecordExportInput>,
    pair_layout: RecordExportPairLayoutConfig,
    grid_layout: RecordExportGridLayoutConfig,
    output_directory: PathBuf,
    file_name: Option<String>,
) -> Result<PathBuf> {
    if records.is_empty() {
        bail!("No records to export");
    }

    let record_count = records.len();
    info!(record_count, "starting record export render");

    let layout = build_final_layout(&records, &pair_layout, &grid_layout)?;
    ensure_canvas_bounds(layout.width, layout.height)?;
    info!(
        record_count,
        width = layout.width,
        height = layout.height,
        "record export canvas prepared"
    );

    let mut canvas = RgbaImage::from_pixel(
        layout.width,
        layout.height,
        Rgba([255_u8, 255_u8, 255_u8, 255_u8]),
    );

    for placed_block in &layout.blocks {
        composite_image_box(
            &mut canvas,
            &placed_block.block.source,
            placed_block.x,
            placed_block.y,
        )?;
        composite_image_box(
            &mut canvas,
            &placed_block.block.result,
            placed_block.x,
            placed_block.y,
        )?;
    }

    std::fs::create_dir_all(&output_directory).with_context(|| {
        format!(
            "Failed to create output directory: {}",
            output_directory.display()
        )
    })?;
    let output_path = unique_output_path(&output_directory, file_name)?;
    save_canvas_png(&output_path, &canvas)?;
    info!(path = %output_path.display(), "record export PNG saved");

    Ok(output_path)
}

fn build_final_layout(
    records: &[RecordExportInput],
    pair_layout: &RecordExportPairLayoutConfig,
    grid_layout: &RecordExportGridLayoutConfig,
) -> Result<FinalLayout> {
    let blocks = records
        .iter()
        .map(|record| build_pair_block(record, pair_layout))
        .collect::<Result<Vec<_>>>()?;
    let column_count =
        grid_layout.limit_per_line.max(1).min(blocks.len().max(1) as u32)
            as usize;
    let h_gap = grid_layout.h_gap;
    let v_gap = grid_layout.v_gap;
    let padding = grid_layout.padding;
    let column_width =
        blocks.iter().map(|block| block.width).max().unwrap_or(1).max(1);
    let mut column_heights = vec![padding; column_count];
    let mut placed_blocks = Vec::with_capacity(blocks.len());

    for block in blocks {
        let column_index = column_heights
            .iter()
            .enumerate()
            .min_by_key(|(_, height)| *height)
            .map(|(index, _)| index)
            .unwrap_or(0);
        let x = padding
            .checked_add(
                (column_index as u32)
                    .saturating_mul(column_width.saturating_add(h_gap)),
            )
            .ok_or_else(|| anyhow!("Export layout width overflow"))?;
        let y = column_heights[column_index];
        column_heights[column_index] = y
            .checked_add(block.height)
            .and_then(|height| height.checked_add(v_gap))
            .ok_or_else(|| anyhow!("Export layout height overflow"))?;
        placed_blocks.push(PlacedBlock { x, y, block });
    }

    let width = padding
        .checked_mul(2)
        .and_then(|value| {
            value
                .checked_add((column_count as u32).saturating_mul(column_width))
        })
        .and_then(|value| {
            value.checked_add(
                (column_count.saturating_sub(1) as u32).saturating_mul(h_gap),
            )
        })
        .ok_or_else(|| anyhow!("Export layout width overflow"))?;
    let used_height = column_heights
        .iter()
        .map(|height| height.saturating_sub(v_gap))
        .max()
        .unwrap_or(padding)
        .max(padding);
    let height = used_height
        .checked_add(padding)
        .ok_or_else(|| anyhow!("Export layout height overflow"))?;

    Ok(FinalLayout {
        width: width.max(1),
        height: height.max(1),
        blocks: placed_blocks,
    })
}

fn build_pair_block(
    record: &RecordExportInput,
    pair_layout: &RecordExportPairLayoutConfig,
) -> Result<PairBlock> {
    let source_dimensions = image::image_dimensions(&record.source_path)
        .with_context(|| {
            format!(
                "Failed to read source image dimensions for record {}: {}",
                record.record_id,
                record.source_path.display()
            )
        })?;
    let result_dimensions = image::image_dimensions(&record.result_path)
        .with_context(|| {
            format!(
                "Failed to read result image dimensions for record {}: {}",
                record.record_id,
                record.result_path.display()
            )
        })?;
    let source_size =
        resolve_image_box_size(&pair_layout.source, source_dimensions);
    let result_size =
        resolve_image_box_size(&pair_layout.result, result_dimensions);
    let gap = pair_layout.gap;
    let padding = pair_layout.padding;

    if pair_layout.horizontal {
        let content_height = source_size.height.max(result_size.height);
        return Ok(PairBlock {
            width: padding
                .saturating_mul(2)
                .saturating_add(source_size.width)
                .saturating_add(gap)
                .saturating_add(result_size.width),
            height: padding.saturating_mul(2).saturating_add(content_height),
            source: ImageBox {
                path: record.source_path.clone(),
                x: padding,
                y: padding,
                width: source_size.width,
                height: source_size.height,
            },
            result: ImageBox {
                path: record.result_path.clone(),
                x: padding
                    .saturating_add(source_size.width)
                    .saturating_add(gap),
                y: padding,
                width: result_size.width,
                height: result_size.height,
            },
        });
    }

    let content_width = source_size.width.max(result_size.width);
    Ok(PairBlock {
        width: padding.saturating_mul(2).saturating_add(content_width),
        height: padding
            .saturating_mul(2)
            .saturating_add(source_size.height)
            .saturating_add(gap)
            .saturating_add(result_size.height),
        source: ImageBox {
            path: record.source_path.clone(),
            x: padding.saturating_add(center_offset(
                content_width,
                source_size.width,
            )),
            y: padding,
            width: source_size.width,
            height: source_size.height,
        },
        result: ImageBox {
            path: record.result_path.clone(),
            x: padding.saturating_add(center_offset(
                content_width,
                result_size.width,
            )),
            y: padding.saturating_add(source_size.height).saturating_add(gap),
            width: result_size.width,
            height: result_size.height,
        },
    })
}

fn resolve_image_box_size(
    config: &RecordExportImageConfig,
    dimensions: (u32, u32),
) -> Size {
    let width = config.width.max(1);
    let height = config.height.max(1);

    if !config.use_ratio {
        return Size { width, height };
    }

    let Some(ratio) = ratio_from_config(config, dimensions) else {
        return Size { width, height };
    };

    if ratio <= 0.0 || !ratio.is_finite() {
        return Size { width, height };
    }

    Size { width, height: ((width as f64) / ratio).round().max(1.0) as u32 }
}

fn ratio_from_config(
    config: &RecordExportImageConfig,
    dimensions: (u32, u32),
) -> Option<f64> {
    if let Some(ratio) =
        config.ratio.filter(|ratio| ratio.is_finite() && *ratio > 0.0)
    {
        return Some(ratio);
    }

    let (width, height) = dimensions;
    (width > 0 && height > 0).then_some(width as f64 / height as f64)
}

fn composite_image_box(
    canvas: &mut RgbaImage,
    image_box: &ImageBox,
    block_x: u32,
    block_y: u32,
) -> Result<()> {
    let image = image::open(&image_box.path).with_context(|| {
        format!("Failed to open image: {}", image_box.path.display())
    })?;
    let resized = image
        .resize(
            image_box.width.max(1),
            image_box.height.max(1),
            imageops::FilterType::Lanczos3,
        )
        .to_rgba8();
    let image_x = block_x
        .saturating_add(image_box.x)
        .saturating_add(center_offset(image_box.width, resized.width()));
    let image_y = block_y
        .saturating_add(image_box.y)
        .saturating_add(center_offset(image_box.height, resized.height()));

    imageops::overlay(canvas, &resized, i64::from(image_x), i64::from(image_y));
    Ok(())
}

fn save_canvas_png(output_path: &Path, canvas: &RgbaImage) -> Result<()> {
    let file = File::create(output_path).with_context(|| {
        format!("Failed to create PNG: {}", output_path.display())
    })?;
    let writer = BufWriter::new(file);
    let encoder = PngEncoder::new_with_quality(
        writer,
        CompressionType::Fast,
        PngFilterType::NoFilter,
    );

    encoder
        .write_image(
            canvas.as_raw(),
            canvas.width(),
            canvas.height(),
            ColorType::Rgba8.into(),
        )
        .with_context(|| {
            format!("Failed to save PNG: {}", output_path.display())
        })
}

fn center_offset(container: u32, child: u32) -> u32 {
    container.saturating_sub(child) / 2
}

fn ensure_canvas_bounds(width: u32, height: u32) -> Result<()> {
    if width > MAX_CANVAS_DIMENSION || height > MAX_CANVAS_DIMENSION {
        bail!("Export image is too large: {width}x{height}");
    }

    let pixels = u64::from(width).saturating_mul(u64::from(height));
    if pixels > MAX_CANVAS_PIXELS {
        bail!("Export image is too large: {width}x{height}");
    }

    Ok(())
}

fn unique_output_path(
    output_directory: &Path,
    file_name: Option<String>,
) -> Result<PathBuf> {
    let base_file_name = sanitize_output_file_name(file_name);
    let mut candidate = output_directory.join(&base_file_name);
    if !candidate.exists() {
        return Ok(candidate);
    }

    let stem = Path::new(&base_file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("grim-record-export")
        .to_string();

    for index in 1..10_000_u32 {
        candidate = output_directory.join(format!("{stem}-{index}.png"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    bail!("Failed to create a unique export file name")
}

fn sanitize_output_file_name(file_name: Option<String>) -> OsString {
    let fallback = default_export_file_name();
    let trimmed = file_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&fallback);
    let file_name = Path::new(trimmed)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or(&fallback);
    let mut path = PathBuf::from(file_name);
    path.set_extension("png");
    path.into_os_string()
}

fn default_export_file_name() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("grim-record-export-{timestamp}.png")
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use image::{Rgba, RgbaImage};

    use super::*;

    fn temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "grim-record-export-{prefix}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("failed to create temp dir");
        dir
    }

    fn write_png(path: &Path, width: u32, height: u32) {
        let image = RgbaImage::from_pixel(width, height, Rgba([0, 0, 0, 255]));
        image.save(path).expect("failed to write fixture image");
    }

    fn input(dir: &Path, id: &str) -> RecordExportInput {
        let source_path = dir.join(format!("{id}-source.png"));
        let result_path = dir.join(format!("{id}-result.png"));
        write_png(&source_path, 100, 200);
        write_png(&result_path, 300, 150);

        RecordExportInput {
            record_id: id.to_string(),
            source_path,
            result_path,
        }
    }

    fn image_config(
        width: u32,
        height: u32,
        use_ratio: bool,
        ratio: Option<f64>,
    ) -> RecordExportImageConfig {
        RecordExportImageConfig { width, height, use_ratio, ratio }
    }

    fn pair_layout(horizontal: bool) -> RecordExportPairLayoutConfig {
        RecordExportPairLayoutConfig {
            source: image_config(100, 100, true, None),
            result: image_config(100, 100, true, None),
            gap: 10,
            padding: 5,
            horizontal,
        }
    }

    fn grid_layout(limit_per_line: u32) -> RecordExportGridLayoutConfig {
        RecordExportGridLayoutConfig {
            h_gap: 10,
            v_gap: 10,
            padding: 20,
            limit_per_line,
        }
    }

    #[test]
    fn render_rejects_empty_records() {
        let dir = temp_dir("empty");
        let error = render_record_export_sync(
            Vec::new(),
            pair_layout(true),
            grid_layout(1),
            dir.clone(),
            Some("empty.png".to_string()),
        )
        .expect_err("empty record export should fail");

        assert!(error.to_string().contains("No records to export"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn builds_horizontal_layout_with_original_ratios() {
        let dir = temp_dir("horizontal");
        let records = vec![input(&dir, "r1"), input(&dir, "r2")];
        let layout =
            build_final_layout(&records, &pair_layout(true), &grid_layout(2))
                .expect("failed to build layout");

        assert_eq!((layout.width, layout.height), (490, 250));
        assert_eq!(layout.blocks[0].x, 20);
        assert_eq!(layout.blocks[0].y, 20);
        assert_eq!(layout.blocks[1].x, 250);
        assert_eq!(layout.blocks[0].block.width, 220);
        assert_eq!(layout.blocks[0].block.height, 210);
        assert_eq!(layout.blocks[0].block.source.width, 100);
        assert_eq!(layout.blocks[0].block.source.height, 200);
        assert_eq!(layout.blocks[0].block.result.width, 100);
        assert_eq!(layout.blocks[0].block.result.height, 50);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn builds_vertical_layout_with_center_offsets() {
        let dir = temp_dir("vertical");
        let record = input(&dir, "r1");
        let layout = RecordExportPairLayoutConfig {
            source: image_config(100, 300, false, None),
            result: image_config(160, 80, false, None),
            gap: 10,
            padding: 5,
            horizontal: false,
        };
        let block =
            build_pair_block(&record, &layout).expect("failed to build block");

        assert_eq!((block.width, block.height), (170, 400));
        assert_eq!((block.source.x, block.source.y), (35, 5));
        assert_eq!((block.result.x, block.result.y), (5, 315));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn ratio_config_takes_priority_over_image_dimensions() {
        let dir = temp_dir("ratio");
        let record = input(&dir, "r1");
        let layout = RecordExportPairLayoutConfig {
            source: image_config(120, 1, true, Some(1.5)),
            result: image_config(100, 1, true, Some(0.5)),
            gap: 0,
            padding: 0,
            horizontal: true,
        };
        let block =
            build_pair_block(&record, &layout).expect("failed to build block");

        assert_eq!((block.source.width, block.source.height), (120, 80));
        assert_eq!((block.result.width, block.result.height), (100, 200));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn invalid_ratio_falls_back_to_original_dimensions() {
        let dir = temp_dir("ratio-fallback");
        let record = input(&dir, "r1");
        let layout = RecordExportPairLayoutConfig {
            source: image_config(100, 999, true, Some(f64::NAN)),
            result: image_config(100, 999, true, Some(-1.0)),
            gap: 0,
            padding: 0,
            horizontal: true,
        };
        let block =
            build_pair_block(&record, &layout).expect("failed to build block");

        assert_eq!((block.source.width, block.source.height), (100, 200));
        assert_eq!((block.result.width, block.result.height), (100, 50));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn canvas_bounds_reject_large_dimensions_and_pixel_counts() {
        assert!(ensure_canvas_bounds(100_001, 1).is_err());
        assert!(ensure_canvas_bounds(10_000, 9_000).is_err());
        assert!(ensure_canvas_bounds(8_000, 10_000).is_ok());
    }

    #[test]
    fn output_file_names_are_sanitized_normalized_and_deduped() {
        let dir = temp_dir("file-name");
        fs::write(dir.join("unsafe.png"), b"existing")
            .expect("failed to seed first path");

        assert_eq!(
            unique_output_path(&dir, Some("../unsafe.jpg".to_string()))
                .expect("failed to create unique path")
                .file_name()
                .and_then(|name| name.to_str()),
            Some("unsafe-1.png")
        );
        assert_eq!(
            sanitize_output_file_name(Some("foo.jpg".to_string())),
            OsString::from("foo.png")
        );
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn render_writes_png_with_expected_dimensions() {
        let dir = temp_dir("render");
        let output_dir = dir.join("out");
        let output_path = render_record_export_sync(
            vec![input(&dir, "r1")],
            pair_layout(true),
            grid_layout(1),
            output_dir,
            Some("rendered.jpg".to_string()),
        )
        .expect("failed to render export");

        assert_eq!(
            output_path.file_name().and_then(|name| name.to_str()),
            Some("rendered.png")
        );
        assert_eq!(
            image::image_dimensions(&output_path)
                .expect("failed to read output image dimensions"),
            (260, 250)
        );
        let _ = fs::remove_dir_all(dir);
    }
}

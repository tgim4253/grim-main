import { convertFileSrc } from '@tauri-apps/api/core';
import type {
  AssetSummary,
  CroquisRecordDetail,
  CroquisRecordSummary,
} from '../../../shared/types';
import type { MasonryImageRatio } from '../common/types';
import type { RecordResultItem } from './types';

const MASONRY_ITEM_WIDTH = 280;
const DEFAULT_TILE_HEIGHT = 320;
const MIN_TILE_HEIGHT = 180;
const MAX_TILE_HEIGHT = 560;

function toFileSrc(path?: string | null) {
  return path ? convertFileSrc(path) : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getVisualAsset(detail?: CroquisRecordDetail | null): AssetSummary | null {
  return detail?.resultAsset ?? detail?.sourceAsset ?? null;
}

function getTileHeight(asset?: AssetSummary | null) {
  if (!asset?.width || !asset.height || asset.width <= 0 || asset.height <= 0) {
    return DEFAULT_TILE_HEIGHT;
  }

  return clamp(
    Math.round((asset.height / asset.width) * MASONRY_ITEM_WIDTH),
    MIN_TILE_HEIGHT,
    MAX_TILE_HEIGHT,
  );
}

function getPlaceholderRatio(asset?: AssetSummary | null): MasonryImageRatio {
  if (!asset?.width || !asset.height || asset.width <= 0 || asset.height <= 0) {
    return '3:4';
  }

  const ratio = asset.width / asset.height;
  if (ratio <= 0.48) {
    return '2:5';
  }
  if (ratio <= 0.68) {
    return '3:5';
  }
  if (ratio <= 0.82) {
    return '3:4';
  }
  return '4:5';
}

export function createRecordResultItem(
  record: CroquisRecordSummary,
  detail?: CroquisRecordDetail | null,
): RecordResultItem {
  const sourceAsset = detail?.sourceAsset ?? null;
  const resultAsset = detail?.resultAsset ?? null;
  const visualAsset = getVisualAsset(detail);
  const resultThumbnailSrc = toFileSrc(resultAsset?.thumbnailPath);
  const resultImageSrc = toFileSrc(resultAsset?.storagePath);
  const sourceThumbnailSrc = toFileSrc(sourceAsset?.thumbnailPath);
  const sourceImageSrc = toFileSrc(sourceAsset?.storagePath);

  return {
    ...record,
    detail,
    sourceAsset,
    resultAsset,
    tags: detail?.tags ?? [],
    imageSrc: resultImageSrc ?? sourceImageSrc,
    thumbnailSrc: resultThumbnailSrc ?? sourceThumbnailSrc,
    sourceImageSrc,
    sourceThumbnailSrc,
    resultImageSrc,
    resultThumbnailSrc,
    ratio: getPlaceholderRatio(visualAsset),
    height: getTileHeight(visualAsset),
  };
}

import { convertFileSrc } from '@tauri-apps/api/core';
import type { AssetDetail, AssetSummary, CroquisRecordDetail } from '../../../shared/types';
import type { ConnectedImageItem, ReferenceAsset } from './types';

const MASONRY_ITEM_WIDTH = 280;
const DEFAULT_TILE_HEIGHT = 320;
const MIN_TILE_HEIGHT = 180;
const MAX_TILE_HEIGHT = 560;

type Translate = (key: string, options?: Record<string, unknown>) => string;

function toFileSrc(path?: string | null) {
  return path ? convertFileSrc(path) : null;
}

function formatDate(value: string | null | undefined, locale: string | undefined, t: Translate) {
  if (!value) {
    return t('common.none', { defaultValue: 'None' });
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatResolution(asset: AssetSummary, t: Translate) {
  if (asset.width && asset.height) {
    return `${asset.width.toLocaleString()} x ${asset.height.toLocaleString()} px`;
  }

  return t('common.unknown', { defaultValue: 'Unknown' });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTileHeight(asset: AssetSummary) {
  if (!asset.width || !asset.height || asset.width <= 0 || asset.height <= 0) {
    return DEFAULT_TILE_HEIGHT;
  }

  return clamp(
    Math.round((asset.height / asset.width) * MASONRY_ITEM_WIDTH),
    MIN_TILE_HEIGHT,
    MAX_TILE_HEIGHT,
  );
}

function getPlaceholderRatio(asset: AssetSummary): ReferenceAsset['ratio'] {
  if (!asset.width || !asset.height || asset.width <= 0 || asset.height <= 0) {
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

function createConnectedImages(
  detail?: AssetDetail,
  recordDetailsById?: ReadonlyMap<string, CroquisRecordDetail>,
): ConnectedImageItem[] {
  const records = detail?.relatedRecords ?? [];
  const tones: ConnectedImageItem['tone'][] = ['portrait', 'gesture', 'shape'];
  const connectedImages: ConnectedImageItem[] = records.slice(0, 3).map((record, index) => {
    const recordDetail = recordDetailsById?.get(record.id);
    const visualAsset = recordDetail?.resultAsset ?? recordDetail?.sourceAsset ?? null;

    return {
      id: record.id,
      tone: tones[index] ?? 'shape',
      active: index === 0,
      title: visualAsset?.fileName ?? record.title,
      imageSrc: toFileSrc(visualAsset?.storagePath),
      thumbnailSrc: toFileSrc(visualAsset?.thumbnailPath),
    };
  });

  connectedImages.push({ id: `${detail?.id ?? 'asset'}-related-add`, tone: 'add' });
  return connectedImages;
}

const defaultTranslate: Translate = (key, options) => {
  const defaultValue = options?.defaultValue;
  return typeof defaultValue === 'string' ? defaultValue : key;
};

export function createReferenceAsset(
  asset: AssetSummary,
  detail?: AssetDetail,
  recordDetailsById?: ReadonlyMap<string, CroquisRecordDetail>,
  t: Translate = defaultTranslate,
  locale?: string,
): ReferenceAsset {
  const relatedRecordCount = detail?.relatedRecords.length ?? 0;

  return {
    id: asset.id,
    title: asset.fileName,
    imageSrc: toFileSrc(asset.storagePath),
    thumbnailSrc: toFileSrc(asset.thumbnailPath),
    ratio: getPlaceholderRatio(asset),
    height: getTileHeight(asset),
    metadata: {
      resolution: formatResolution(asset, t),
      addedAt: formatDate(asset.createdAt, locale, t),
      lastCroquisAt: formatDate(detail?.lastCroquisAt, locale, t),
    },
    folders: detail?.virtualFolders.map(folder => folder.fullPath || folder.name) ?? [],
    folderItems:
      detail?.virtualFolders.map(folder => ({
        id: folder.id,
        path: folder.fullPath || folder.name,
      })) ?? [],
    croquisResult: {
      label: t('references.croquis_records', { defaultValue: 'Croquis Records' }),
      status:
        relatedRecordCount > 0
          ? t('references.linked_count', {
              count: relatedRecordCount,
              formattedCount: relatedRecordCount.toLocaleString(),
              defaultValue: '{{formattedCount}} linked',
            })
          : t('common.none', { defaultValue: 'None' }),
      connectedImages: createConnectedImages(detail, recordDetailsById),
    },
  };
}

import type { CroquisRecordDetail, RecordExportGridLayoutConfig } from '@/shared/types';
import type {
  RecordExportImageDraftConfig,
  RecordExportPairLayoutDraftConfig,
  RecordExportRatioMode,
} from './types';

const MIN_SIZE = 1;
const MAX_PREVIEW_CANVAS_SIZE = 720;

type Size = {
  width: number;
  height: number;
};

type Point = {
  x: number;
  y: number;
};

export type RecordExportImageRole = 'source' | 'result';

export type RecordExportImageBox = Size &
  Point & {
    role: RecordExportImageRole;
  };

export type RecordExportPairBlock = Size & {
  recordId: string;
  source: RecordExportImageBox;
  result: RecordExportImageBox;
};

export type RecordExportPlacedBlock = RecordExportPairBlock & Point;

export type RecordExportFinalLayout = Size & {
  blocks: RecordExportPlacedBlock[];
  scale: number;
};

function toPositiveNumber(value: number | null | undefined, fallback: number) {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function ratioFromMode(
  ratioMode: RecordExportRatioMode,
  config: RecordExportImageDraftConfig,
  assetWidth?: number | null,
  assetHeight?: number | null,
) {
  switch (ratioMode) {
    case 'original': {
      const width = toPositiveNumber(assetWidth, 0);
      const height = toPositiveNumber(assetHeight, 0);
      return width > 0 && height > 0 ? width / height : null;
    }
    case '1:1':
      return 1;
    case '1:1.6':
      return 1 / 1.6;
    case '1.6:1':
      return 1.6;
    case 'custom': {
      const width = toPositiveNumber(config.customRatioWidth, 0);
      const height = toPositiveNumber(config.customRatioHeight, 0);
      return width > 0 && height > 0 ? width / height : null;
    }
    default:
      return null;
  }
}

export function resolveImageBoxSize(
  config: RecordExportImageDraftConfig,
  assetWidth?: number | null,
  assetHeight?: number | null,
): Size {
  const width = Math.max(MIN_SIZE, Math.round(toPositiveNumber(config.width, MIN_SIZE)));
  const height = Math.max(MIN_SIZE, Math.round(toPositiveNumber(config.height, MIN_SIZE)));

  if (!config.useRatio) {
    return { width, height };
  }

  const ratio = ratioFromMode(config.ratioMode, config, assetWidth, assetHeight);
  if (!ratio || ratio <= 0) {
    return { width, height };
  }

  return {
    width,
    height: Math.max(MIN_SIZE, Math.round(width / ratio)),
  };
}

function centerOffset(container: number, child: number) {
  return Math.max(0, Math.round((container - child) / 2));
}

export function buildRecordPairBlock(
  record: CroquisRecordDetail,
  pairLayout: RecordExportPairLayoutDraftConfig,
): RecordExportPairBlock {
  const sourceSize = resolveImageBoxSize(
    pairLayout.source,
    record.sourceAsset?.width,
    record.sourceAsset?.height,
  );
  const resultSize = resolveImageBoxSize(
    pairLayout.result,
    record.resultAsset?.width,
    record.resultAsset?.height,
  );
  const gap = Math.max(0, Math.round(pairLayout.gap));
  const padding = Math.max(0, Math.round(pairLayout.padding));

  if (pairLayout.horizontal) {
    const contentHeight = Math.max(sourceSize.height, resultSize.height);
    return {
      recordId: record.id,
      width: padding * 2 + sourceSize.width + gap + resultSize.width,
      height: padding * 2 + contentHeight,
      source: {
        role: 'source',
        x: padding,
        y: padding,
        ...sourceSize,
      },
      result: {
        role: 'result',
        x: padding + sourceSize.width + gap,
        y: padding,
        ...resultSize,
      },
    };
  }

  const contentWidth = Math.max(sourceSize.width, resultSize.width);
  return {
    recordId: record.id,
    width: padding * 2 + contentWidth,
    height: padding * 2 + sourceSize.height + gap + resultSize.height,
    source: {
      role: 'source',
      x: padding + centerOffset(contentWidth, sourceSize.width),
      y: padding,
      ...sourceSize,
    },
    result: {
      role: 'result',
      x: padding + centerOffset(contentWidth, resultSize.width),
      y: padding + sourceSize.height + gap,
      ...resultSize,
    },
  };
}

export function flattenBoxData(blocks: readonly RecordExportPairBlock[]) {
  return blocks.flatMap(block => [block.source, block.result]);
}

export function buildFinalExportLayout(
  records: readonly CroquisRecordDetail[],
  pairLayout: RecordExportPairLayoutDraftConfig,
  gridLayout: RecordExportGridLayoutConfig,
): RecordExportFinalLayout {
  const blocks = records.map(record => buildRecordPairBlock(record, pairLayout));
  const limitPerLine = Math.max(1, Math.round(gridLayout.limitPerLine));
  const columnCount = Math.max(1, Math.min(limitPerLine, Math.max(blocks.length, 1)));
  const hGap = Math.max(0, Math.round(gridLayout.hGap));
  const vGap = Math.max(0, Math.round(gridLayout.vGap));
  const padding = Math.max(0, Math.round(gridLayout.padding));
  const columnWidth = blocks.reduce((maxWidth, block) => Math.max(maxWidth, block.width), 0);
  const columnHeights = Array.from({ length: columnCount }, () => padding);
  const placedBlocks: RecordExportPlacedBlock[] = [];

  for (const block of blocks) {
    let columnIndex = 0;
    for (let index = 1; index < columnHeights.length; index += 1) {
      if (columnHeights[index] < columnHeights[columnIndex]) {
        columnIndex = index;
      }
    }

    const x = padding + columnIndex * (columnWidth + hGap);
    const y = columnHeights[columnIndex];
    placedBlocks.push({ ...block, x, y });
    columnHeights[columnIndex] = y + block.height + vGap;
  }

  const width = padding * 2 + columnCount * columnWidth + Math.max(0, columnCount - 1) * hGap;
  const usedHeight = Math.max(...columnHeights.map(height => height - vGap), padding);
  const height = usedHeight + padding;
  const scale = Math.min(1, MAX_PREVIEW_CANVAS_SIZE / Math.max(width, height, MIN_SIZE));

  return {
    width: Math.max(MIN_SIZE, width),
    height: Math.max(MIN_SIZE, height),
    blocks: placedBlocks,
    scale,
  };
}

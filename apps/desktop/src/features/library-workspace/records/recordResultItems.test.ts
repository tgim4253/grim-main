import { describe, expect, it } from 'vitest';
import type { AssetSummary, CroquisRecordDetail, CroquisRecordSummary } from '@/shared/types';
import { createRecordResultItem } from './recordResultItems';

const now = '2026-01-01T00:00:00.000Z';

function asset(id: string, width?: number | null, height?: number | null): AssetSummary {
  return {
    id,
    hash: `${id}-hash`,
    storagePath: `/images/${id}.png`,
    thumbnailPath: `/thumbs/${id}.png`,
    fileName: `${id}.png`,
    fileSize: 1,
    width,
    height,
    createdAt: now,
    updatedAt: now,
  };
}

function summary(id = 'record-1'): CroquisRecordSummary {
  return {
    id,
    title: 'Record 1',
    sourceAssetId: 'source',
    resultAssetId: 'result',
    createdAt: now,
    updatedAt: now,
  };
}

function detail(overrides: Partial<CroquisRecordDetail> = {}): CroquisRecordDetail {
  return {
    ...summary(),
    note: '',
    tags: [],
    sourceAsset: asset('source', 100, 200),
    resultAsset: asset('result', 300, 150),
    ...overrides,
  };
}

describe('createRecordResultItem', () => {
  it('prefers result assets for visual image, thumbnail, ratio, and height', () => {
    const item = createRecordResultItem(summary(), detail());

    expect(item.imageSrc).toBe('asset:///images/result.png');
    expect(item.thumbnailSrc).toBe('asset:///thumbs/result.png');
    expect(item.sourceImageSrc).toBe('asset:///images/source.png');
    expect(item.resultImageSrc).toBe('asset:///images/result.png');
    expect(item.ratio).toBe('4:5');
    expect(item.height).toBe(180);
  });

  it('falls back to source assets when result assets are missing', () => {
    const item = createRecordResultItem(summary(), detail({ resultAsset: null }));

    expect(item.imageSrc).toBe('asset:///images/source.png');
    expect(item.thumbnailSrc).toBe('asset:///thumbs/source.png');
    expect(item.resultImageSrc).toBeNull();
    expect(item.ratio).toBe('3:5');
    expect(item.height).toBe(560);
  });

  it('uses default ratio and height for records without image dimensions', () => {
    const item = createRecordResultItem(summary(), detail({ resultAsset: asset('result') }));

    expect(item.ratio).toBe('3:4');
    expect(item.height).toBe(320);
  });

  it('assigns ratio buckets and clamps tile heights', () => {
    expect(
      createRecordResultItem(summary('narrow'), detail({ resultAsset: asset('narrow', 40, 100) }))
        .ratio,
    ).toBe('2:5');
    expect(
      createRecordResultItem(summary('mid'), detail({ resultAsset: asset('mid', 60, 100) })).ratio,
    ).toBe('3:5');
    expect(
      createRecordResultItem(
        summary('three-four'),
        detail({ resultAsset: asset('three-four', 75, 100) }),
      ).ratio,
    ).toBe('3:4');
    expect(
      createRecordResultItem(summary('wide'), detail({ resultAsset: asset('wide', 90, 100) }))
        .ratio,
    ).toBe('4:5');
    expect(
      createRecordResultItem(summary('short'), detail({ resultAsset: asset('short', 1000, 100) }))
        .height,
    ).toBe(180);
    expect(
      createRecordResultItem(summary('tall'), detail({ resultAsset: asset('tall', 100, 4000) }))
        .height,
    ).toBe(560);
  });
});

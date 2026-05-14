import { describe, expect, it } from 'vitest';
import type { CroquisRecordDetail } from '@/shared/types';
import {
  buildFinalExportLayout,
  buildRecordPairBlock,
  flattenBoxData,
  resolveImageBoxSize,
} from './layout';
import type { RecordExportImageDraftConfig, RecordExportPairLayoutDraftConfig } from './types';

const baseImageConfig: RecordExportImageDraftConfig = {
  width: 100,
  height: 100,
  useRatio: false,
  ratioMode: 'original',
};

const pairLayout: RecordExportPairLayoutDraftConfig = {
  source: {
    width: 100,
    height: 100,
    useRatio: true,
    ratioMode: 'original',
  },
  result: {
    width: 100,
    height: 100,
    useRatio: true,
    ratioMode: 'original',
  },
  gap: 10,
  padding: 5,
  horizontal: true,
};

function record(
  id: string,
  sourceSize: { width: number; height: number } = { width: 100, height: 200 },
  resultSize: { width: number; height: number } = { width: 300, height: 150 },
): CroquisRecordDetail {
  return {
    id,
    title: id,
    sourceAssetId: `${id}-source`,
    resultAssetId: `${id}-result`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    note: '',
    tags: [],
    sourceAsset: {
      id: `${id}-source`,
      hash: `${id}-source-hash`,
      storagePath: `/tmp/${id}-source.png`,
      fileName: `${id}-source.png`,
      fileSize: 1,
      width: sourceSize.width,
      height: sourceSize.height,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    resultAsset: {
      id: `${id}-result`,
      hash: `${id}-result-hash`,
      storagePath: `/tmp/${id}-result.png`,
      fileName: `${id}-result.png`,
      fileSize: 1,
      width: resultSize.width,
      height: resultSize.height,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

describe('resolveImageBoxSize', () => {
  it('uses explicit width and height when ratio is disabled', () => {
    expect(resolveImageBoxSize({ ...baseImageConfig, width: 123.4, height: 55.6 })).toEqual({
      width: 123,
      height: 56,
    });
  });

  it('uses original asset ratio when requested', () => {
    expect(
      resolveImageBoxSize(
        { ...baseImageConfig, width: 100, height: 999, useRatio: true, ratioMode: 'original' },
        100,
        200,
      ),
    ).toEqual({ width: 100, height: 200 });
  });

  it('uses fixed and custom ratios before falling back to configured height', () => {
    expect(
      resolveImageBoxSize({
        ...baseImageConfig,
        width: 160,
        height: 10,
        useRatio: true,
        ratioMode: '1.6:1',
      }),
    ).toEqual({ width: 160, height: 100 });

    expect(
      resolveImageBoxSize({
        ...baseImageConfig,
        width: 120,
        height: 10,
        useRatio: true,
        ratioMode: 'custom',
        customRatioWidth: 3,
        customRatioHeight: 2,
      }),
    ).toEqual({ width: 120, height: 80 });

    expect(
      resolveImageBoxSize({
        ...baseImageConfig,
        width: 120,
        height: 77,
        useRatio: true,
        ratioMode: 'custom',
        customRatioWidth: 0,
        customRatioHeight: 2,
      }),
    ).toEqual({ width: 120, height: 77 });
  });

  it('clamps invalid dimensions to the minimum fallback', () => {
    expect(resolveImageBoxSize({ ...baseImageConfig, width: Number.NaN, height: -10 })).toEqual({
      width: 1,
      height: 1,
    });
  });
});

describe('record export pair layout', () => {
  it('builds horizontal source/result blocks using padding and gap', () => {
    expect(buildRecordPairBlock(record('r1'), pairLayout)).toMatchObject({
      recordId: 'r1',
      width: 220,
      height: 210,
      source: { role: 'source', x: 5, y: 5, width: 100, height: 200 },
      result: { role: 'result', x: 115, y: 5, width: 100, height: 50 },
    });
  });

  it('builds vertical blocks with centered image offsets', () => {
    expect(
      buildRecordPairBlock(record('r1'), {
        ...pairLayout,
        horizontal: false,
        source: { ...pairLayout.source, width: 100, useRatio: false },
        result: { ...pairLayout.result, width: 160, height: 80, useRatio: false },
      }),
    ).toMatchObject({
      width: 170,
      height: 200,
      source: { x: 35, y: 5, width: 100, height: 100 },
      result: { x: 5, y: 115, width: 160, height: 80 },
    });
  });

  it('flattens source and result boxes in block order', () => {
    const block = buildRecordPairBlock(record('r1'), pairLayout);

    expect(flattenBoxData([block]).map(box => box.role)).toEqual(['source', 'result']);
  });
});

describe('buildFinalExportLayout', () => {
  it('places blocks into shortest grid columns with padding and gaps', () => {
    const layout = buildFinalExportLayout([record('r1'), record('r2'), record('r3')], pairLayout, {
      hGap: 7,
      vGap: 11,
      padding: 20,
      limitPerLine: 2,
    });

    expect(layout).toMatchObject({
      width: 487,
      height: 471,
      scale: 1,
    });
    expect(layout.blocks.map(block => ({ id: block.recordId, x: block.x, y: block.y }))).toEqual([
      { id: 'r1', x: 20, y: 20 },
      { id: 'r2', x: 247, y: 20 },
      { id: 'r3', x: 20, y: 241 },
    ]);
  });

  it('clamps preview scale when the canvas exceeds the preview maximum', () => {
    const layout = buildFinalExportLayout([record('r1')], pairLayout, {
      hGap: 0,
      vGap: 0,
      padding: 1000,
      limitPerLine: 1,
    });

    expect(layout.width).toBe(2220);
    expect(layout.height).toBe(2210);
    expect(layout.scale).toBeCloseTo(720 / 2220);
  });
});

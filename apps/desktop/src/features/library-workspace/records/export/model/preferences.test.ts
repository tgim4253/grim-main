import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RECORD_EXPORT_GRID_LAYOUT, DEFAULT_RECORD_EXPORT_PAIR_LAYOUT } from './types';
import { loadRecordExportSettings, saveRecordExportSettings } from './preferences';

const STORAGE_KEY = 'grim.recordExport.settings.v1';

const validSettings = {
  version: 1,
  outputDirectory: '/tmp/exports',
  skipIncomplete: false,
  pairLayout: {
    source: {
      width: 123,
      height: 234,
      useRatio: false,
      ratioMode: '1:1' as const,
    },
    result: {
      width: 456,
      height: 567,
      useRatio: true,
      ratioMode: 'custom' as const,
      customRatioWidth: 4,
      customRatioHeight: 3,
    },
    gap: 12,
    padding: 8,
    horizontal: false,
  },
  gridLayout: {
    hGap: 9,
    vGap: 10,
    padding: 11,
    limitPerLine: 4,
  },
};

beforeEach(() => {
  localStorage.clear();
});

describe('loadRecordExportSettings', () => {
  it('returns defaults when localStorage is empty, malformed, or version mismatched', () => {
    expect(loadRecordExportSettings()).toEqual({
      outputDirectory: '',
      skipIncomplete: true,
      pairLayout: DEFAULT_RECORD_EXPORT_PAIR_LAYOUT,
      gridLayout: DEFAULT_RECORD_EXPORT_GRID_LAYOUT,
    });

    localStorage.setItem(STORAGE_KEY, '{broken');
    expect(loadRecordExportSettings().pairLayout).toEqual(DEFAULT_RECORD_EXPORT_PAIR_LAYOUT);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...validSettings, version: 2 }));
    expect(loadRecordExportSettings().gridLayout).toEqual(DEFAULT_RECORD_EXPORT_GRID_LAYOUT);
  });

  it('loads valid settings from storage', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validSettings));

    expect(loadRecordExportSettings()).toEqual({
      outputDirectory: '/tmp/exports',
      skipIncomplete: false,
      pairLayout: validSettings.pairLayout,
      gridLayout: validSettings.gridLayout,
    });
  });

  it('clamps numeric fields and falls back for invalid ratio modes', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...validSettings,
        pairLayout: {
          source: {
            width: -10,
            height: Number.POSITIVE_INFINITY,
            useRatio: 'yes',
            ratioMode: 'weird',
          },
          result: {
            width: 20.6,
            height: 30.4,
            useRatio: true,
            ratioMode: '1.6:1',
            customRatioWidth: 0,
            customRatioHeight: 100_001,
          },
          gap: -1,
          padding: 1.6,
          horizontal: 'no',
        },
        gridLayout: {
          hGap: -5,
          vGap: 2.4,
          padding: 100_001,
          limitPerLine: 999,
        },
      }),
    );

    expect(loadRecordExportSettings()).toEqual({
      outputDirectory: '/tmp/exports',
      skipIncomplete: false,
      pairLayout: {
        source: {
          width: 1,
          height: DEFAULT_RECORD_EXPORT_PAIR_LAYOUT.source.height,
          useRatio: DEFAULT_RECORD_EXPORT_PAIR_LAYOUT.source.useRatio,
          ratioMode: DEFAULT_RECORD_EXPORT_PAIR_LAYOUT.source.ratioMode,
          customRatioWidth: undefined,
          customRatioHeight: undefined,
        },
        result: {
          width: 21,
          height: 30,
          useRatio: true,
          ratioMode: '1.6:1',
          customRatioWidth: 1,
          customRatioHeight: 10_000,
        },
        gap: 0,
        padding: 2,
        horizontal: DEFAULT_RECORD_EXPORT_PAIR_LAYOUT.horizontal,
      },
      gridLayout: {
        hGap: 0,
        vGap: 2,
        padding: 10_000,
        limitPerLine: 100,
      },
    });
  });
});

describe('saveRecordExportSettings', () => {
  it('round-trips saved settings through localStorage', () => {
    saveRecordExportSettings({
      outputDirectory: '/tmp/round-trip',
      skipIncomplete: true,
      pairLayout: validSettings.pairLayout,
      gridLayout: validSettings.gridLayout,
    });

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({ version: 1 });
    expect(loadRecordExportSettings()).toEqual({
      outputDirectory: '/tmp/round-trip',
      skipIncomplete: true,
      pairLayout: validSettings.pairLayout,
      gridLayout: validSettings.gridLayout,
    });
  });
});

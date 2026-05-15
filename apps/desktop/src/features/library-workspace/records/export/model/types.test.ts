import { describe, expect, it } from 'vitest';
import type { CroquisRecordDetail } from '@/shared/types';
import { isExportableRecord } from './types';

function detail(overrides: Partial<CroquisRecordDetail> = {}): CroquisRecordDetail {
  return {
    id: 'record-1',
    title: 'Record 1',
    sourceAssetId: 'source-1',
    resultAssetId: 'result-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    note: '',
    tags: [],
    sourceAsset: {
      id: 'source-1',
      hash: 'source-hash',
      storagePath: '/tmp/source.png',
      fileName: 'source.png',
      fileSize: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    resultAsset: {
      id: 'result-1',
      hash: 'result-hash',
      storagePath: '/tmp/result.png',
      fileName: 'result.png',
      fileSize: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('isExportableRecord', () => {
  it('requires both source and result assets with non-empty storage paths', () => {
    expect(isExportableRecord(detail())).toBe(true);
    expect(isExportableRecord(detail({ sourceAsset: null }))).toBe(false);
    expect(isExportableRecord(detail({ resultAsset: null }))).toBe(false);
    expect(
      isExportableRecord(
        detail({
          sourceAsset: {
            id: 'source-1',
            hash: 'source-hash',
            storagePath: ' ',
            fileName: 'source.png',
            fileSize: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ),
    ).toBe(false);
    expect(
      isExportableRecord(
        detail({
          resultAsset: {
            id: 'result-1',
            hash: 'result-hash',
            storagePath: undefined,
            fileName: 'result.png',
            fileSize: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        }),
      ),
    ).toBe(false);
  });
});

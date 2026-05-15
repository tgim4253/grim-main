import { describe, expect, it } from 'vitest';
import type { RecordResultItem } from '../types';
import { createRecordsBySourceAssetId, getRelatedRecords } from './recordRelations';

const now = '2026-01-01T00:00:00.000Z';

function item(id: string, sourceAssetId?: string | null): RecordResultItem {
  return {
    id,
    title: id,
    sourceAssetId,
    createdAt: now,
    updatedAt: now,
    tags: [],
    ratio: '3:4',
    height: 320,
  };
}

describe('record relations', () => {
  it('groups records by source asset id and skips records without a source asset', () => {
    const first = item('r1', 'asset-1');
    const second = item('r2', 'asset-1');
    const noSource = item('r3', null);
    const map = createRecordsBySourceAssetId([first, second, noSource]);

    expect(map.get('asset-1')).toEqual([first, second]);
    expect(map.has('')).toBe(false);
  });

  it('returns related records for the same source while excluding the current record', () => {
    const first = item('r1', 'asset-1');
    const second = item('r2', 'asset-1');
    const other = item('r3', 'asset-2');
    const map = createRecordsBySourceAssetId([first, second, other]);

    expect(getRelatedRecords(first, map)).toEqual([second]);
    expect(getRelatedRecords(item('no-source', null), map)).toEqual([]);
  });
});

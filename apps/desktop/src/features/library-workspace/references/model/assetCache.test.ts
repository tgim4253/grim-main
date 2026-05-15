import { describe, expect, it } from 'vitest';
import type {
  AssetDetail,
  AssetRecordCount,
  AssetSummary,
  CroquisRecordDetail,
  CroquisRecordSummary,
} from '@/shared/types';
import {
  createAssetRecordCountMap,
  createRelatedRecordDetailMap,
  mergeCachedAssetDetails,
  mergeCachedAssetRecordCounts,
} from './assetCache';

const now = '2026-01-01T00:00:00.000Z';

function asset(id: string): AssetSummary {
  return {
    id,
    hash: `${id}-hash`,
    fileName: `${id}.png`,
    fileSize: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function record(id: string): CroquisRecordSummary {
  return { id, title: id, createdAt: now, updatedAt: now };
}

function detail(id: string, relatedRecords: CroquisRecordSummary[] = []): AssetDetail {
  return { ...asset(id), virtualFolders: [], relatedRecords };
}

function recordDetail(id: string): CroquisRecordDetail {
  return { ...record(id), note: '', tags: [] };
}

describe('asset cache helpers', () => {
  it('maps fulfilled related record details by source record id', () => {
    const records = [record('r1'), record('r2')];
    const fulfilled = recordDetail('detail-r1');

    expect(
      createRelatedRecordDetailMap(records, [
        { status: 'fulfilled', value: fulfilled },
        { status: 'rejected', reason: new Error('nope') },
      ]).get('r1'),
    ).toBe(fulfilled);
  });

  it('creates record count maps for known assets only', () => {
    const counts: AssetRecordCount[] = [
      { assetId: 'a', relatedRecordCount: 3 },
      { assetId: 'missing', relatedRecordCount: 9 },
    ];

    expect(createAssetRecordCountMap([asset('a'), asset('b')], counts)).toEqual(
      new Map([
        ['a', 3],
        ['b', 0],
      ]),
    );
  });

  it('merges cached details and keeps the same reference when no known ids change', () => {
    const current = new Map([['a', detail('a')]]);
    const updated = detail('a', [record('r1')]);

    expect(mergeCachedAssetDetails(current, [detail('missing')])).toBe(current);
    const merged = mergeCachedAssetDetails(current, [updated]);
    expect(merged).not.toBe(current);
    expect(merged.get('a')).toBe(updated);
  });

  it('merges record counts from cached details and preserves unchanged references', () => {
    const current = new Map([
      ['a', 0],
      ['b', 2],
    ]);

    expect(mergeCachedAssetRecordCounts(current, [detail('missing')])).toBe(current);
    expect(
      mergeCachedAssetRecordCounts(current, [detail('a', [record('r1'), record('r2')])]),
    ).toEqual(
      new Map([
        ['a', 2],
        ['b', 2],
      ]),
    );
  });
});

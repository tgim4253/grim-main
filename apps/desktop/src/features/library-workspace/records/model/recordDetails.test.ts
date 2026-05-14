import { describe, expect, it } from 'vitest';
import type { CroquisRecordDetail, Tag } from '@/shared/types';
import { createDetailMap, getTagIds, isDefined, recordSummaryFromDetail } from './recordDetails';

const now = '2026-01-01T00:00:00.000Z';

function detail(id: string): CroquisRecordDetail {
  return {
    id,
    title: `Title ${id}`,
    sourceAssetId: `source-${id}`,
    resultAssetId: `result-${id}`,
    targetDurationSeconds: 60,
    actualDurationSeconds: 55,
    finishedAt: now,
    createdAt: now,
    updatedAt: now,
    note: 'note',
    tags: [],
  };
}

function tag(id: string): Tag {
  return { id, name: id, sortOrder: 1, createdAt: now, updatedAt: now };
}

describe('record detail helpers', () => {
  it('creates a detail map keyed by record id', () => {
    const first = detail('r1');
    const second = detail('r2');

    expect(createDetailMap([first, second]).get('r2')).toBe(second);
  });

  it('deduplicates tag ids while preserving first-seen order', () => {
    expect(getTagIds([tag('a'), tag('b'), tag('a'), { ...tag(''), id: '' }])).toEqual(['a', 'b']);
  });

  it('keeps only summary fields when deriving a record summary', () => {
    expect(recordSummaryFromDetail(detail('r1'))).toEqual({
      id: 'r1',
      title: 'Title r1',
      sourceAssetId: 'source-r1',
      resultAssetId: 'result-r1',
      targetDurationSeconds: 60,
      actualDurationSeconds: 55,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });

  it('narrows non-nullish values', () => {
    expect([1, null, 2, undefined].filter(isDefined)).toEqual([1, 2]);
  });
});

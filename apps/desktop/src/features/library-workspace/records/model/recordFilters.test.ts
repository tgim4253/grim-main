import { describe, expect, it } from 'vitest';
import type { Tag, TagGroup, TagIndex } from '@/shared/types';
import type { RecordResultItem } from '../types';
import {
  UNGROUPED_RECORD_FILTER_GROUP_KEY,
  createRecordFilterGroups,
  hasActiveSelectedRecordFilters,
  pruneSelectedRecordFilters,
  recordMatchesSelectedFilters,
} from './recordFilters';

const now = '2026-01-01T00:00:00.000Z';

function group(id: string, name: string, sortOrder: number): TagGroup {
  return { id, name, sortOrder, createdAt: now, updatedAt: now };
}

function tag(id: string, name: string, sortOrder: number, groupId?: string | null): Tag {
  return { id, name, sortOrder, groupId, createdAt: now, updatedAt: now };
}

function item(id: string, tags: Tag[]): RecordResultItem {
  return {
    id,
    title: id,
    createdAt: now,
    updatedAt: now,
    tags,
    ratio: '3:4',
    height: 320,
  };
}

describe('createRecordFilterGroups', () => {
  it('sorts groups and tags, drops empty groups, and appends ungrouped tags', () => {
    const tagIndex: TagIndex = {
      groups: [group('g2', 'Beta', 2), group('empty', 'Empty', 0), group('g1', 'Alpha', 1)],
      tags: [
        tag('t3', 'Zebra', 2, 'g1'),
        tag('t1', 'Apple', 1, 'g1'),
        tag('t2', 'No Group B', 2),
        tag('t4', 'No Group A', 1, null),
        tag('t5', 'Beta Tag', 1, 'g2'),
      ],
    };

    expect(createRecordFilterGroups(tagIndex)).toEqual([
      {
        key: 'g1',
        label: 'Alpha',
        tags: [
          { id: 't1', name: 'Apple' },
          { id: 't3', name: 'Zebra' },
        ],
      },
      {
        key: 'g2',
        label: 'Beta',
        tags: [{ id: 't5', name: 'Beta Tag' }],
      },
      {
        key: UNGROUPED_RECORD_FILTER_GROUP_KEY,
        label: 'Ungrouped',
        tags: [
          { id: 't4', name: 'No Group A' },
          { id: 't2', name: 'No Group B' },
        ],
      },
    ]);
  });
});

describe('recordMatchesSelectedFilters', () => {
  const red = tag('red', 'Red', 1, 'color');
  const blue = tag('blue', 'Blue', 2, 'color');
  const portrait = tag('portrait', 'Portrait', 1, 'kind');

  it('matches OR within a group and AND across groups', () => {
    expect(
      recordMatchesSelectedFilters(item('match', [red, portrait]), {
        color: ['red', 'blue'],
        kind: ['portrait'],
      }),
    ).toBe(true);

    expect(
      recordMatchesSelectedFilters(item('miss-kind', [red]), {
        color: ['red', 'blue'],
        kind: ['portrait'],
      }),
    ).toBe(false);

    expect(recordMatchesSelectedFilters(item('empty', []), {})).toBe(true);
  });

  it('reports whether selected filters contain any active tag ids', () => {
    expect(hasActiveSelectedRecordFilters({ color: [] })).toBe(false);
    expect(hasActiveSelectedRecordFilters({ color: ['red'] })).toBe(true);
  });
});

describe('pruneSelectedRecordFilters', () => {
  const filterGroups = [
    {
      key: 'color',
      label: 'Color',
      tags: [
        { id: 'red', name: 'Red' },
        { id: 'blue', name: 'Blue' },
      ],
    },
  ];

  it('removes stale group keys and tag ids', () => {
    expect(
      pruneSelectedRecordFilters(
        {
          color: ['red', 'missing'],
          stale: ['old'],
        },
        filterGroups,
      ),
    ).toEqual({ color: ['red'] });
  });

  it('returns the same reference when nothing changes', () => {
    const selected = { color: ['red'] };

    expect(pruneSelectedRecordFilters(selected, filterGroups)).toBe(selected);
  });
});

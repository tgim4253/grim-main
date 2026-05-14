import { describe, expect, it } from 'vitest';
import type { Tag, TagGroup, TagIndex } from '@/shared/types';
import {
  UNGROUPED_GROUP_VALUE,
  formatTagCount,
  getGroupedTags,
  getNextGroupSortOrder,
  getNextTagSortOrder,
  getPanelTitle,
  getSelectionKey,
  normalizeName,
  parseSortOrder,
} from './tagSettingsModel';

const now = '2026-01-01T00:00:00.000Z';
const t = (_key: string, options?: Record<string, unknown>) =>
  String(options?.defaultValue ?? '').replace(/{{(\w+)}}/g, (_match, name: string) =>
    String(options?.[name] ?? _match),
  );

function group(id: string, name: string, sortOrder: number): TagGroup {
  return { id, name, sortOrder, createdAt: now, updatedAt: now };
}

function tag(id: string, name: string, sortOrder: number, groupId?: string | null): Tag {
  return { id, name, sortOrder, groupId, createdAt: now, updatedAt: now };
}

describe('tag settings model', () => {
  it('normalizes names and parses sort order input', () => {
    expect(normalizeName('  Name  ')).toBe('Name');
    expect(parseSortOrder('')).toBeNull();
    expect(parseSortOrder('abc')).toBeUndefined();
    expect(parseSortOrder('12.9')).toBe(12);
  });

  it('calculates next sort orders', () => {
    expect(getNextGroupSortOrder([])).toBe(0);
    expect(getNextGroupSortOrder([group('g1', 'A', 10), group('g2', 'B', 30)])).toBe(40);
    expect(getNextTagSortOrder([tag('a', 'A', 10, 'g1'), tag('b', 'B', 20, null)], 'g1')).toBe(20);
    expect(getNextTagSortOrder([tag('a', 'A', 10, 'g1')], null)).toBe(0);
  });

  it('groups and sorts grouped plus ungrouped tags', () => {
    const tagIndex: TagIndex = {
      groups: [group('g2', 'B', 2), group('g1', 'A', 1)],
      tags: [
        tag('b', 'B Tag', 2, 'g1'),
        tag('a', 'A Tag', 1, 'g1'),
        tag('u', 'Ungrouped Tag', 1, null),
      ],
    };

    expect(getGroupedTags(tagIndex, t)).toMatchObject([
      { id: 'g1', name: 'A', tags: [{ id: 'a' }, { id: 'b' }] },
      { id: 'g2', name: 'B', tags: [] },
      { id: null, name: 'Ungrouped', tags: [{ id: 'u' }], synthetic: true },
    ]);
  });

  it('builds stable selection keys, panel titles, and tag count labels', () => {
    expect(getSelectionKey({ kind: 'group', id: 'g1' })).toBe('group:g1');
    expect(getSelectionKey({ kind: 'tag', id: 't1' })).toBe('tag:t1');
    expect(getSelectionKey({ kind: 'new-group' })).toBe('new-group');
    expect(getSelectionKey({ kind: 'new-tag', groupId: null })).toBe(
      `new-tag:${UNGROUPED_GROUP_VALUE}`,
    );
    expect(getPanelTitle({ kind: 'new-group' }, t)).toBe('New Group');
    expect(getPanelTitle({ kind: 'group', id: 'g1' }, t)).toBe('Tag Group');
    expect(getPanelTitle({ kind: 'new-tag', groupId: null }, t)).toBe('New Tag');
    expect(getPanelTitle({ kind: 'tag', id: 't1' }, t)).toBe('Tag Detail');
    expect(formatTagCount(1234, t)).toBe('1,234 TAGS');
  });
});

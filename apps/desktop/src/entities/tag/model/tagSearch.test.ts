import { describe, expect, it } from 'vitest';
import type { Tag, TagGroup } from '@/shared/types';
import { filterTagSearchOptions } from './tagSearch';

const now = '2026-01-01T00:00:00.000Z';

function group(id: string, name: string): TagGroup {
  return { id, name, sortOrder: 1, createdAt: now, updatedAt: now };
}

function tag(id: string, name: string, groupId?: string | null, color?: string | null): Tag {
  return { id, name, groupId, color, sortOrder: 1, createdAt: now, updatedAt: now };
}

describe('filterTagSearchOptions', () => {
  const groupsById = new Map([['g1', group('g1', 'Warm Group')]]);
  const tags = [tag('red', 'Red Line', 'g1', '#FF0000'), tag('blue', 'Blue Tone', null, '#0000ff')];

  it('returns a new copy for empty queries', () => {
    const result = filterTagSearchOptions('   ', tags, groupsById);

    expect(result).toEqual(tags);
    expect(result).not.toBe(tags);
  });

  it('matches by tag name, group name, and color case-insensitively', () => {
    expect(filterTagSearchOptions('red', tags, groupsById).map(item => item.id)).toEqual(['red']);
    expect(filterTagSearchOptions(' warm ', tags, groupsById).map(item => item.id)).toEqual([
      'red',
    ]);
    expect(filterTagSearchOptions('#0000FF', tags, groupsById).map(item => item.id)).toEqual([
      'blue',
    ]);
  });
});

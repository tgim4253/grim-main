import { describe, expect, it } from 'vitest';
import type { VirtualFolder } from '@/shared/types';
import { filterFolderSearchOptions } from './folderSearch';

const now = '2026-01-01T00:00:00.000Z';

function folder(overrides: Partial<VirtualFolder>): VirtualFolder {
  return {
    id: 'folder-1',
    name: 'Folder',
    fullPath: '/Library/Folder',
    alias: null,
    kind: 'user',
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('filterFolderSearchOptions', () => {
  const folders = [
    folder({ id: 'folder-1', name: 'Portraits', fullPath: '/Library/People', alias: 'Faces' }),
    folder({ id: 'folder-2', name: 'System', kind: 'system_uncategorized' }),
  ];

  it('returns a new copy for empty queries', () => {
    const result = filterFolderSearchOptions(' ', folders);

    expect(result).toEqual(folders);
    expect(result).not.toBe(folders);
  });

  it('matches name, full path, alias, and kind case-insensitively', () => {
    expect(filterFolderSearchOptions('portrait', folders).map(item => item.id)).toEqual([
      'folder-1',
    ]);
    expect(filterFolderSearchOptions('people', folders).map(item => item.id)).toEqual(['folder-1']);
    expect(filterFolderSearchOptions('faces', folders).map(item => item.id)).toEqual(['folder-1']);
    expect(filterFolderSearchOptions('UNCATEGORIZED', folders).map(item => item.id)).toEqual([
      'folder-2',
    ]);
  });
});

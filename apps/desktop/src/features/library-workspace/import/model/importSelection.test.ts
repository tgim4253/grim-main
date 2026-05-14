import { describe, expect, it } from 'vitest';
import type { VirtualFolder } from '@/shared/types';
import {
  getDefaultImportFolderId,
  normalizeDialogSelection,
  normalizeSelectedFilePaths,
} from './importSelection';

const now = '2026-01-01T00:00:00.000Z';

function folder(id: string): VirtualFolder {
  return {
    id,
    name: id,
    fullPath: `/Library/${id}`,
    kind: 'user',
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  };
}

describe('import selection model', () => {
  it('defaults to the active folder source when that folder exists', () => {
    const folderById = new Map([['folder-1', folder('folder-1')]]);

    expect(
      getDefaultImportFolderId({
        assetSource: { kind: 'folder', folderId: 'folder-1' },
        folderById,
      }),
    ).toBe('folder-1');
  });

  it('returns undefined when the active source is not an existing folder', () => {
    const folderById = new Map([['folder-1', folder('folder-1')]]);

    expect(
      getDefaultImportFolderId({
        assetSource: { kind: 'folder', folderId: 'missing' },
        folderById,
      }),
    ).toBeUndefined();
    expect(
      getDefaultImportFolderId({ assetSource: { kind: 'allAssets' }, folderById }),
    ).toBeUndefined();
  });

  it('trims, drops empty paths, and deduplicates selected files', () => {
    expect(normalizeSelectedFilePaths([' /tmp/a.png ', '', '/tmp/b.png', '/tmp/a.png'])).toEqual([
      '/tmp/a.png',
      '/tmp/b.png',
    ]);
  });

  it('normalizes dialog selections to arrays', () => {
    expect(normalizeDialogSelection(null)).toEqual([]);
    expect(normalizeDialogSelection('/tmp/a.png')).toEqual(['/tmp/a.png']);
    expect(normalizeDialogSelection(['/tmp/a.png', '/tmp/b.png'])).toEqual([
      '/tmp/a.png',
      '/tmp/b.png',
    ]);
  });
});

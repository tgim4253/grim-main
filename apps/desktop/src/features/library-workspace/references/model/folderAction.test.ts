import { describe, expect, it } from 'vitest';
import type { ExplorerSnapshot, VirtualFolder } from '@/shared/types';
import { getSelectableFolders } from './folderAction';

const now = '2026-01-01T00:00:00.000Z';

function folder(id: string, kind: VirtualFolder['kind'] = 'user'): VirtualFolder {
  return {
    id,
    name: id,
    fullPath: `/${id}`,
    kind,
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  };
}

describe('getSelectableFolders', () => {
  it('allows only user folders without children', () => {
    const snapshot: ExplorerSnapshot = {
      virtualFolders: [folder('leaf'), folder('parent'), folder('system', 'system_uncategorized')],
      folderStats: [
        { folderId: 'leaf', childCount: 0, directAssetCount: 0, descendantAssetCount: 0 },
        { folderId: 'parent', childCount: 1, directAssetCount: 0, descendantAssetCount: 0 },
      ],
      allAssetsCount: 0,
      unassignedAssetsCount: 0,
      recentRecords: [],
    };

    expect(getSelectableFolders(snapshot).map(item => item.id)).toEqual(['leaf']);
  });
});

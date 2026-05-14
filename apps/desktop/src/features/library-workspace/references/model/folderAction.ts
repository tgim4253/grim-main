import type { ExplorerSnapshot } from '@/shared/types';

export function getSelectableFolders(snapshot: ExplorerSnapshot) {
  const statsByFolderId = new Map(snapshot.folderStats.map(stats => [stats.folderId, stats]));

  return snapshot.virtualFolders.filter(folder => {
    const stats = statsByFolderId.get(folder.id);
    return folder.kind === 'user' && (stats?.childCount ?? 0) === 0;
  });
}

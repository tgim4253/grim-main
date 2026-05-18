import type {
  AssetListSource,
  ExplorerSnapshot,
  FolderStats,
  VirtualFolder,
} from '../../shared/types';
import type { ExplorerNode } from './types';

export const ALL_ASSETS_NODE_ID = 'section:all-assets';
export const UNCATEGORIZED_NODE_ID = 'section:uncategorized';
export const RECENT_RECORDS_NODE_ID = 'section:recent-records';
export const FOLDERS_NODE_ID = 'section:folders';

export const DEFAULT_ASSET_SOURCE: AssetListSource = { kind: 'allAssets' };

type Translate = (key: string, options?: Record<string, unknown>) => string;

function formatCount(value: number) {
  return value.toLocaleString();
}

function createStatsMap(stats: readonly FolderStats[]) {
  return new Map(stats.map(item => [item.folderId, item]));
}

function compareFolders(left: VirtualFolder, right: VirtualFolder) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.name.localeCompare(right.name);
}

function groupFoldersByParent(folders: readonly VirtualFolder[]) {
  const groups = new Map<string | null, VirtualFolder[]>();

  for (const folder of folders) {
    const parentId = folder.parentId ?? null;
    const group = groups.get(parentId) ?? [];
    group.push(folder);
    groups.set(parentId, group);
  }

  for (const group of groups.values()) {
    group.sort(compareFolders);
  }

  return groups;
}

function createFolderNode(
  folder: VirtualFolder,
  childrenByParentId: ReadonlyMap<string | null, VirtualFolder[]>,
  statsByFolderId: ReadonlyMap<string, FolderStats>,
): ExplorerNode {
  const childFolders = childrenByParentId.get(folder.id) ?? [];
  const children = childFolders.map(child =>
    createFolderNode(child, childrenByParentId, statsByFolderId),
  );
  const stats = statsByFolderId.get(folder.id);
  const hasChildren = children.length > 0;

  return {
    id: `folder:${folder.id}`,
    label: folder.alias?.trim() || folder.name,
    icon: hasChildren ? 'folder-open' : 'folder',
    meta: formatCount(stats?.descendantAssetCount ?? 0),
    source: hasChildren ? undefined : { kind: 'folder', folderId: folder.id },
    folder,
    children,
    defaultExpanded: folder.parentId === null,
  };
}

export function buildExplorerNodes(
  snapshot: ExplorerSnapshot | null,
  t: Translate,
): ExplorerNode[] {
  const allAssetsCount = snapshot?.allAssetsCount ?? 0;
  const unassignedAssetsCount = snapshot?.unassignedAssetsCount ?? 0;
  const folders = snapshot?.virtualFolders ?? [];
  const childrenByParentId = groupFoldersByParent(folders);
  const statsByFolderId = createStatsMap(snapshot?.folderStats ?? []);
  const rootFolders = childrenByParentId.get(null) ?? [];

  return [
    {
      id: ALL_ASSETS_NODE_ID,
      label: t('explorer.all_assets', { defaultValue: 'All Assets' }),
      icon: 'grid',
      meta: formatCount(allAssetsCount),
      source: DEFAULT_ASSET_SOURCE,
    },
    {
      id: UNCATEGORIZED_NODE_ID,
      label: t('explorer.uncategorized', { defaultValue: 'Uncategorized' }),
      icon: 'folder',
      meta: formatCount(unassignedAssetsCount),
      source: { kind: 'uncategorized' },
    },
    {
      id: RECENT_RECORDS_NODE_ID,
      label: t('explorer.recent_records', { defaultValue: 'Recent Records' }),
      icon: 'gesture',
      meta: '',
      view: 'records',
    },
    {
      id: FOLDERS_NODE_ID,
      label: t('explorer.folders', { defaultValue: 'Folders' }),
      icon: 'folder-open',
      meta: '',
      children: rootFolders.map(folder =>
        createFolderNode(folder, childrenByParentId, statsByFolderId),
      ),
      defaultExpanded: true,
      showActions: true,
    },
  ];
}

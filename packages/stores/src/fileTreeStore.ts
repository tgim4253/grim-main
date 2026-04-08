import { create } from 'zustand';
import type { VirtualFolder } from '@tgim/types/library';

export type ExplorerSelection =
  | { kind: 'allAssets' }
  | { kind: 'uncategorized' }
  | { kind: 'recentRecords' }
  | { kind: 'sessions' }
  | { kind: 'folder'; folderId: string }
  | { kind: 'record'; recordId: string }
  | { kind: 'session'; sessionId: string; firstRecordId?: string | null };

export interface ExplorerFolderNode extends VirtualFolder {
  depth: number;
  children: ExplorerFolderNode[];
}

interface FileTreeState {
  folders: VirtualFolder[];
  expandedFolderIds: string[];
  selectedItem: ExplorerSelection;
  setFolders: (folders: VirtualFolder[]) => void;
  setSelectedItem: (item: ExplorerSelection) => void;
  toggleFolder: (folderId: string) => void;
  expandFolder: (folderId: string) => void;
  collapseFolder: (folderId: string) => void;
  ensureExpanded: (folderId: string) => void;
  buildTree: () => ExplorerFolderNode[];
}

const sortFolders = (folders: VirtualFolder[]) => {
  return [...folders].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.fullPath.localeCompare(right.fullPath, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
};

const buildFolderTree = (folders: VirtualFolder[]): ExplorerFolderNode[] => {
  const byId = new Map<string, ExplorerFolderNode>();

  for (const folder of sortFolders(folders)) {
    byId.set(folder.id, {
      ...folder,
      depth: 0,
      children: [],
    });
  }

  const roots: ExplorerFolderNode[] = [];
  for (const folder of byId.values()) {
    const parentId = folder.parentId ?? null;
    if (!parentId) {
      roots.push(folder);
      continue;
    }

    const parent = byId.get(parentId);
    if (!parent) {
      roots.push(folder);
      continue;
    }

    folder.depth = parent.depth + 1;
    parent.children.push(folder);
  }

  const visit = (nodes: ExplorerFolderNode[], depth: number) => {
    nodes.sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });

    for (const node of nodes) {
      node.depth = depth;
      visit(node.children, depth + 1);
    }
  };

  visit(roots, 0);
  return roots;
};

const buildAncestorIds = (folders: VirtualFolder[], folderId: string): string[] => {
  const folderMap = new Map(folders.map(folder => [folder.id, folder]));
  const ancestors: string[] = [];
  let cursor = folderMap.get(folderId);

  while (cursor?.parentId) {
    ancestors.push(cursor.parentId);
    cursor = folderMap.get(cursor.parentId);
  }

  return ancestors;
};

const pushUnique = (source: string[], nextId: string) => {
  if (source.includes(nextId)) {
    return source;
  }

  return [...source, nextId];
};

const useFileTreeStore = create<FileTreeState>((set, get) => ({
  folders: [],
  expandedFolderIds: [],
  selectedItem: { kind: 'allAssets' },

  setFolders: folders => {
    set(state => {
      const sorted = sortFolders(folders);
      const validIds = new Set(sorted.map(folder => folder.id));
      const expandedFolderIds = state.expandedFolderIds.filter(id => validIds.has(id));
      const selectedItem =
        state.selectedItem.kind === 'folder' && !validIds.has(state.selectedItem.folderId)
          ? { kind: 'allAssets' as const }
          : state.selectedItem;

      return {
        folders: sorted,
        expandedFolderIds,
        selectedItem,
      };
    });
  },

  setSelectedItem: item => {
    set(state => {
      if (item.kind !== 'folder') {
        return { selectedItem: item };
      }

      const ancestors = buildAncestorIds(state.folders, item.folderId);
      return {
        selectedItem: item,
        expandedFolderIds: Array.from(new Set([...state.expandedFolderIds, ...ancestors])),
      };
    });
  },

  toggleFolder: folderId => {
    set(state => {
      const isExpanded = state.expandedFolderIds.includes(folderId);
      return {
        expandedFolderIds: isExpanded
          ? state.expandedFolderIds.filter(id => id !== folderId)
          : [...state.expandedFolderIds, folderId],
      };
    });
  },

  expandFolder: folderId => {
    set(state => ({
      expandedFolderIds: pushUnique(state.expandedFolderIds, folderId),
    }));
  },

  collapseFolder: folderId => {
    set(state => ({
      expandedFolderIds: state.expandedFolderIds.filter(id => id !== folderId),
    }));
  },

  ensureExpanded: folderId => {
    set(state => {
      const ancestors = buildAncestorIds(state.folders, folderId);
      const nextExpanded = ancestors.reduce(pushUnique, state.expandedFolderIds);
      return { expandedFolderIds: nextExpanded };
    });
  },

  buildTree: () => buildFolderTree(get().folders),
}));

export default useFileTreeStore;

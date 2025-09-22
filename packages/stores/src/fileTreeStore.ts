import { create } from 'zustand';
import {
  FileTreeData,
  GraphResponse,
  NodeFile,
  NodeFolder,
  NodeKind,
  RelationType,
} from '@tgim/types/index';

interface FileTreeState {
  // current tree data
  treeData: FileTreeData[];
  setTreeData: (data: FileTreeData[]) => void;
  convertToTreeData: (data: GraphResponse) => FileTreeData[];

  selectedNodeId: string | null;
  setSelectedNode: (id: string | null) => void;
  ensureVisible: (id: string) => string[] | null;

  // move nodes into a parent (append)
  onMove: (args: { dragIds: string[]; parentId: string; index?: number }) => void;
}

/* utils */

// Find node by id in the whole tree
const findNode = (tree: FileTreeData[], id: string): FileTreeData | null => {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children?.length) {
      const f = findNode(n.children, id);
      if (f) return f;
    }
  }
  return null;
};

// Returns true if `childId` is within subtree rooted at `parentId` (self counts as descendant)
const isDescendant = (tree: FileTreeData[], parentId: string, childId: string): boolean => {
  if (parentId === childId) return true;
  const parent = findNode(tree, parentId);
  if (!parent?.children?.length) return false;
  const stack = [...parent.children];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur.id === childId) return true;
    if (cur.children?.length) stack.push(...cur.children);
  }
  return false;
};

// A node can accept children if it's a folder-like node
const canAcceptChildren = (node: FileTreeData | null): boolean => {
  // Heuristic: folder icon OR already has children
  if (!node) return false;
  if (node.icon === 'folder') return true;
  return !!node.children?.length;
};

// Remove a node by id; returns removed node and next tree
const removeNode = (
  tree: FileTreeData[],
  id: string,
): { removed: FileTreeData | null; next: FileTreeData[] } => {
  const next: FileTreeData[] = [];
  let removed: FileTreeData | null = null;

  for (const n of tree) {
    if (n.id === id) {
      removed = { ...n };
      continue;
    }
    if (n.children?.length) {
      const { removed: r, next: ch } = removeNode(n.children, id);
      if (r) removed = r;
      next.push({ ...n, children: ch });
    } else {
      next.push(n);
    }
  }
  return { removed, next };
};

// Path from root to id (inclusive) or null when not found
const findPathToNode = (tree: FileTreeData[], id: string, path: string[] = []): string[] | null => {
  for (const node of tree) {
    const nextPath = [...path, node.id];
    if (node.id === id) return nextPath;
    if (node.children?.length) {
      const found = findPathToNode(node.children, id, nextPath);
      if (found) return found;
    }
  }
  return null;
};

// Insert `node` under `parentId` (append). Special parentId "root" means top-level.
const insertNode = (tree: FileTreeData[], parentId: string, node: FileTreeData): FileTreeData[] => {
  if (parentId === 'root') return [...tree, node];
  return tree.map(n => {
    if (n.id !== parentId) {
      return n.children?.length ? { ...n, children: insertNode(n.children, parentId, node) } : n;
    }
    const children = n.children?.length ? [...n.children, node] : [node];
    return { ...n, children };
  });
};

// Depth map (id -> depth) to process deeper nodes first
const buildDepthMap = (
  tree: FileTreeData[],
  depth = 0,
  map: Map<string, number> = new Map(),
): Map<string, number> => {
  for (const n of tree) {
    map.set(n.id, depth);
    if (n.children?.length) buildDepthMap(n.children, depth + 1, map);
  }
  return map;
};

// Batch move into a parent (append), skipping invalid cycles and child-of-selected duplicates
const batchMoveIntoParent = (tree: FileTreeData[], ids: string[], targetParent: string) => {
  const depthMap = buildDepthMap(tree);
  const unique = Array.from(new Set(ids));

  const filtered = unique
    // prevent cycles: cannot move a node into its own descendant (or itself)
    .filter(id => id !== targetParent && !isDescendant(tree, id, targetParent))
    // drop children if their ancestor is also selected
    .filter(id => !unique.some(o => o !== id && isDescendant(tree, o, id)));

  // Move deeper nodes first
  filtered.sort((a, b) => (depthMap.get(b) ?? 0) - (depthMap.get(a) ?? 0));

  let next = tree;
  for (const id of filtered) {
    const { removed, next: n } = removeNode(next, id);
    if (!removed) continue;
    next = insertNode(n, targetParent, removed);
  }
  return next;
};

/* store */

const useFileTreeStore = create<FileTreeState>((set, get) => ({
  treeData: [],
  setTreeData: data =>
    set(state => {
      const next: Partial<FileTreeState> = { treeData: data };
      if (state.selectedNodeId && !findNode(data, state.selectedNodeId)) {
        next.selectedNodeId = null;
      }
      return next;
    }),

  selectedNodeId: null,
  setSelectedNode: id => set({ selectedNodeId: id }),
  ensureVisible: id => {
    if (!id) return null;
    const path = findPathToNode(get().treeData, id);
    if (!path) return null;
    return path.slice(0, -1);
  },

  convertToTreeData: data => {
    const { nodes, connections } = data;

    const nodeMap = new Map<string, FileTreeData>();
    const incoming = new Map<string, number>();

    for (const n of nodes) {
      const folderData = (n.data?.['Folder'] as NodeFolder) ?? undefined;
      const fileData = (n.data?.['File'] as NodeFile) ?? undefined;
      nodeMap.set(n.id, {
        id: n.id,
        name: folderData?.folder_name ?? fileData?.file_name ?? '',
        icon: n.kind === 'folder' ? 'folder' : 'file',
        type: n.kind === 'folder' ? NodeKind.Folder : NodeKind.File,
        children: n.kind === 'folder' ? [] : undefined,
      });

      incoming.set(n.id, 0);
    }
    const childrenMap = new Map<string, FileTreeData[]>();

    for (const conn of connections) {
      if (conn.kind !== RelationType.ChildFolder && conn.kind !== RelationType.ContainsFile)
        continue;

      const parent = nodeMap.get(conn.src_node_id);
      const child = nodeMap.get(conn.dst_node_id);

      if (!parent || !child) continue;
      if (parent.id === child.id) continue;
      // if (parent.type !== "folder") continue;

      const arr = childrenMap.get(parent.id) ?? [];
      if (!arr.some(c => c.id === child.id)) arr.push(child);
      childrenMap.set(parent.id, arr);

      incoming.set(child.id, (incoming.get(child.id) ?? 0) + 1);
    }

    for (const [id, node] of nodeMap) {
      if (node.type === 'folder') {
        node.children = childrenMap.get(id) ?? [];
      } else {
        node.children = undefined;
      }
    }

    const roots: FileTreeData[] = [];
    for (const [id, cnt] of incoming) {
      if (cnt === 0) {
        const rootNode = nodeMap.get(id);
        if (rootNode) roots.push(rootNode);
      }
    }

    return roots;
  },

  onMove: ({ dragIds, parentId }) => {
    if (!dragIds?.length) return;

    // disallow moving into itself
    if (parentId && dragIds.includes(parentId)) return;

    const tree = get().treeData;

    // validate target container (except for "root")
    if (parentId !== 'root') {
      const target = findNode(tree, parentId);
      if (!canAcceptChildren(target)) return;
    }

    const next = batchMoveIntoParent(tree, dragIds, parentId ?? 'root');
    set({ treeData: next });
  },
}));

export default useFileTreeStore;

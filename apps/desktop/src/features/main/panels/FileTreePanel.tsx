import { FileTreeData } from '@tgim/types/index';
import { useMemo, useState } from 'react';
import {
  useHoverOpen,
  useMultiSelect,
  useStandardSensors,
  DragHandle,
  parseDropTarget,
} from '@tgim/dnd/index';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { NodeList } from '@tgim/ui/index';
import { File, Folder } from 'lucide-react';

const sampleData: FileTreeData[] = [
  {
    id: '1',
    name: 'Root 1',
    icon: 'folder',
    path: '',
    type: 'Note',
    children: [{ id: '1-1', name: 'Child 1-1', icon: 'file', path: '', type: 'Note' }],
  },
  {
    id: '2',
    name: 'Root 2',
    icon: 'folder',
    path: '',
    type: 'Note',
    children: [{ id: '2-1', name: 'Child 2-1', icon: 'file', path: '', type: 'Note' }],
  },
];

//#region utils
export const findNode = (tree: FileTreeData[], id: string): FileTreeData | null => {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children) {
      const f = findNode(n.children, id);
      if (f) return f;
    }
  }
  return null;
};

// Returns true if `childId` is within subtree rooted at `parentId`.
// Also returns true if both ids are the same (self is treated as descendant).
export const isDescendant = (tree: FileTreeData[], parentId: string, childId: string): boolean => {
  if (parentId === childId) return true;
  const parent = findNode(tree, parentId);
  if (!parent?.children) return false;

  const stack: FileTreeData[] = [...parent.children];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur.id === childId) return true;
    if (cur.children) stack.push(...cur.children);
  }
  return false;
};

// for rendering depth, return id -> depth map
const buildDepthMap = (
  tree: FileTreeData[],
  depth = 0,
  map: Map<string, number> = new Map<string, number>(),
): Map<string, number> => {
  for (const n of tree) {
    map.set(n.id, depth);
    if (n.children?.length) buildDepthMap(n.children, depth + 1, map);
  }
  return map;
};

//Returns a flat list of node ids as they would appear in a tree UI,
// respecting "expanded" state(Set of expanded folder id). Children of collapsed nodes are omitted.
const flattenVisible = (tree: FileTreeData[], expanded: Set<string>): string[] => {
  const out: string[] = [];

  const walk = (nodes: FileTreeData[]) => {
    for (const n of nodes) {
      out.push(n.id);
      if (n.children?.length && expanded.has(n.id)) {
        walk(n.children);
      }
    }
  };

  walk(tree);
  return out;
};

//temp
export const removeNode = (
  tree: FileTreeData[],
  id: string,
): { removed: FileTreeData | null; next: FileTreeData[] } => {
  // Removes the node (by id) from the tree immutably.
  // Returns the removed node and the next root array.
  const next: FileTreeData[] = [];
  let removed: FileTreeData | null = null;

  for (const n of tree) {
    if (n.id === id) {
      // Shallow-clone to keep immutability expectations clear
      removed = { ...n };
      continue; // skip pushing this node
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

export const insertNode = (
  tree: FileTreeData[],
  parentId: string,
  node: FileTreeData,
): FileTreeData[] => {
  // Inserts `node` under `parentId` immutably.
  // Special-case: "root" means append at top level.
  if (parentId === 'root') return [...tree, node];

  return tree.map(n => {
    if (n.id !== parentId) {
      return n.children ? { ...n, children: insertNode(n.children, parentId, node) } : n;
    }
    const children = n.children ? [...n.children, node] : [node];
    return { ...n, children };
  });
};

// Batch move (append), filtering invalid moves and parent/child conflicts
export const batchMoveIntoParent = (
  tree: FileTreeData[],
  ids: string[],
  targetParent: string,
): FileTreeData[] => {
  // Moves multiple nodes under `targetParent` (append),
  // skipping illegal moves (cycles) and removing child entries when their parent is also selected.
  const depthMap = buildDepthMap(tree);

  const unique = Array.from(new Set(ids));

  const filtered = unique
    // prevent cycles: can't move a node into its own descendant or itself
    .filter(id => id !== targetParent && !isDescendant(tree, id, targetParent))
    // drop children if their ancestor is also selected (move ancestor once)
    .filter(id => !unique.some(o => o !== id && isDescendant(tree, o, id)));

  // Move deeper nodes first so we don't disturb ancestors before their children move
  filtered.sort((a, b) => (depthMap.get(b) ?? 0) - (depthMap.get(a) ?? 0));

  let next = tree;
  for (const id of filtered) {
    const { removed, next: n } = removeNode(next, id);
    if (!removed) continue; // silently skip if id not found
    next = insertNode(n, targetParent, removed);
  }
  return next;
};

//#endregion utils

export function FileTree({ initialData = sampleData }: { initialData?: FileTreeData[] }) {
  const [tree, setTree] = useState<FileTreeData[]>(initialData);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const walk = (nodes: FileTreeData[]) => {
      for (const n of nodes) {
        if (n.children?.length) s.add(n.id);
        if (n.children) walk(n.children);
      }
    };
    walk(initialData);
    return s;
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  // Multi-select
  const visibleOrder = useMemo(() => flattenVisible(tree, expanded), [tree, expanded]);
  const { selected, onItemClick, clearSelection, onDragStartSelect } = useMultiSelect(visibleOrder);

  // Hover-to-open
  const { hoverId, onDragOverHoverOpen, resetHoverOpen } = useHoverOpen(
    id => {
      setExpanded(prev => new Set(prev).add(id));
    },
    {
      delay: 700,
      isValidTarget: () => true,
    },
  );

  // DnD
  const sensors = useStandardSensors(4);
  const depthMap = useMemo(() => buildDepthMap(tree), [tree]);

  const activeNode = activeId ? findNode(tree, activeId) : null;
  const activeLabel = activeNode?.name ?? '';

  return (
    <div className="w-full h-full text-sidebar-text" onClick={clearSelection}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => {
          const id = String(active.id);
          setActiveId(id);
          onDragStartSelect(id);
        }}
        onDragCancel={() => {
          setActiveId(null);
          resetHoverOpen();
        }}
        onDragOver={({ over, active }) => {
          onDragOverHoverOpen(over?.id, [String(active.id)]);
        }}
        onDragEnd={({ active, over }) => {
          setActiveId(null);
          const target = parseDropTarget(over?.id);
          if (!target) return;
          const targetParent = target.id;

          // Move all selected (or the active one) into target folder/container (append only)
          const ids = selected.size ? Array.from(selected) : [String(active.id)];
          const nextTree = batchMoveIntoParent(tree, ids, targetParent);
          if (nextTree === tree) return;

          setExpanded(prev => (targetParent !== 'root' ? new Set(prev).add(targetParent) : prev));
          setTree(nextTree);
          // onChange?.(nextTree);
          resetHoverOpen();
        }}
      >
        <NodeList
          parentId="root"
          nodes={tree}
          expandedSet={expanded}
          onToggle={id =>
            setExpanded(prev => {
              const n = new Set(prev);
              n.has(id) ? n.delete(id) : n.add(id);
              return n;
            })
          }
          depthMap={depthMap}
          dragging={!!activeId}
          hoverId={hoverId}
          selectedSet={selected}
          onSelect={onItemClick}
        />

        <DragOverlay dropAnimation={null}>
          {activeNode ? (
            <DragHandle>
              {activeNode.icon === 'folder' ? (
                <Folder className="size-3.5" />
              ) : (
                <File className="size-3.5" />
              )}
            </DragHandle>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export default FileTree;

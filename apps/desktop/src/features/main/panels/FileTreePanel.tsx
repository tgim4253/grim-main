import { FileTreeData } from '@tgim/types/index';
import { useEffect, useMemo, useState } from 'react';
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
import useFileTreeStore from '@tgim/stores/fileTreeStore';
import { useShallow } from 'zustand/shallow';

/* local utils for rendering */

// Find node by id (UI helper)
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

// Returns a depth map used for indent rendering
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

// Returns visible id list based on expanded set
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

export const FileTree = () => {
  // Select only what we need from the store (shallow compare to reduce re-renders)
  const { treeData, onMove } = useFileTreeStore(
    useShallow(s => ({
      treeData: s.treeData,
      onMove: s.onMove,
    })),
  );

  // Expanded state: open folders initially if they have children
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const walk = (nodes: FileTreeData[]) => {
      for (const n of nodes) {
        if (n.children?.length) s.add(n.id);
        if (n.children) walk(n.children);
      }
    };
    walk([]);
    return s;
  });

  const [activeId, setActiveId] = useState<string | null>(null);

  // Multi-select (based on visible order)
  const visibleOrder = useMemo(() => flattenVisible(treeData, expanded), [treeData, expanded]);
  const { selected, onItemClick, clearSelection, onDragStartSelect } = useMultiSelect(visibleOrder);

  // Hover-to-open folder while dragging
  const { hoverId, onDragOverHoverOpen, resetHoverOpen } = useHoverOpen(
    id => setExpanded(prev => new Set(prev).add(id)),
    { delay: 700, isValidTarget: () => true },
  );

  // DnD sensors and depth map for rendering
  const sensors = useStandardSensors(4);
  const depthMap = useMemo(() => buildDepthMap(treeData), [treeData]);

  const activeNode = activeId ? findNode(treeData, activeId) : null;

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
          const targetParent = target.id; // "root" or folder id

          // Move all selected (or the active one) into target container (append)
          const ids = selected.size ? Array.from(selected) : [String(active.id)];

          onMove({
            dragIds: ids,
            parentId: targetParent,
            index: 0, // currently unused; kept for API compatibility
          });

          // Expand the drop target if it is not the root
          setExpanded(prev => (targetParent !== 'root' ? new Set(prev).add(targetParent) : prev));

          resetHoverOpen();
        }}
      >
        <NodeList
          parentId="root"
          nodes={treeData}
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
};

export default FileTree;

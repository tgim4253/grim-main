import React, { useMemo, useState } from 'react';
import { DndContext, closestCenter, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, File, Folder, MoreVertical } from 'lucide-react';
import { FileNode } from './types';
import { batchMoveIntoParent, buildDepthMap, findNode, flattenVisible } from './ops';
import { asContainerId, asFolderId, parseDropTarget } from '@/shared/dndIds';
import { ContainerDroppable } from '@/shared/ContainerDroppable';
import { DragChip } from '@/shared/DragChip';
import { useStandardSensors } from '@/shared/sensors';
import { useMultiSelect } from '@/shared/useMultiSelect';
import { useHoverOpen } from '@/shared/useHoverOpen';

// Sample data (replace with your own)
const sampleData: FileNode[] = [
  {
    id: '1',
    name: 'Root 1',
    icon: 'folder',
    path: '',
    type: 'Note',
    children: [
      { id: '1-1', name: 'Child 1-1', icon: 'file', path: '', type: 'Note' },
      {
        id: '1-2',
        name: 'Child 1-2',
        icon: 'file',
        path: '',
        type: 'Note',
        children: [{ id: '1-2-1', name: 'Subchild 1-2-1', icon: 'file', path: '', type: 'Note' }],
      },
    ],
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

const Row: React.FC<{
  node: FileNode;
  depth: number;
  expanded: boolean;
  onToggle: (id: string) => void;
  hovered?: boolean;
  selected?: boolean;
  onSelect?: (e: React.MouseEvent, id: string) => void;
}> = ({ node, depth, expanded, onToggle, hovered, selected, onSelect }) => {
  const isFolder = node.icon === 'folder';
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: node.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: asFolderId(node.id),
    disabled: !isFolder,
  });
  const setRefs = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };
  const highlight = hovered || isOver;

  return (
    <li ref={setRefs} className="list-none">
      <div
        className={`group flex items-center gap-2 w-full select-none rounded-xl pr-2 py-1.5 ${
          highlight
            ? 'ring-2 ring-indigo-400/70 bg-indigo-50/60'
            : selected
              ? 'bg-indigo-100 ring-1 ring-indigo-300'
              : isDragging
                ? 'bg-indigo-50'
                : 'hover:bg-zinc-100'
        }`}
        style={{ paddingLeft: depth * 16 + 8, cursor: isDragging ? 'grabbing' : 'default' }}
        onClick={e => onSelect?.(e, node.id)}
        {...attributes}
        {...listeners}
      >
        {isFolder ? (
          <button
            className="size-5 grid place-content-center text-zinc-500 hover:text-zinc-800"
            onClick={e => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : (
          <span className="size-5" />
        )}

        <span className="text-zinc-700">
          {isFolder ? <Folder className="size-4" /> : <File className="size-4" />}
        </span>
        <span className="text-sm text-zinc-800 font-medium flex-1 truncate">{node.name}</span>
        <button className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-500 hover:text-zinc-800">
          <MoreVertical className="size-4" />
        </button>
      </div>
    </li>
  );
};

const NodeList: React.FC<{
  parentId: string;
  nodes: FileNode[];
  expandedSet: Set<string>;
  onToggle: (id: string) => void;
  depthMap: Map<string, number>;
  dragging: boolean;
  hoverId: string | null;
  selectedSet: Set<string>;
  onSelect: (e: React.MouseEvent, id: string) => void;
}> = ({
  parentId,
  nodes,
  expandedSet,
  onToggle,
  depthMap,
  dragging,
  hoverId,
  selectedSet,
  onSelect,
}) => {
  return (
    <ContainerDroppable id={asContainerId(parentId)} dragging={dragging}>
      {nodes.map(node => {
        const depth = depthMap.get(node.id) ?? 0;
        const expanded = expandedSet.has(node.id);
        const selected = selectedSet.has(node.id);
        return (
          <React.Fragment key={node.id}>
            <Row
              node={node}
              depth={depth}
              expanded={expanded}
              onToggle={onToggle}
              hovered={hoverId === node.id}
              selected={selected}
              onSelect={onSelect}
            />
            {node.icon === 'folder' && node.children?.length && expanded ? (
              <NodeList
                parentId={node.id}
                nodes={node.children}
                expandedSet={expandedSet}
                onToggle={onToggle}
                depthMap={depthMap}
                dragging={dragging}
                hoverId={hoverId}
                selectedSet={selectedSet}
                onSelect={onSelect}
              />
            ) : null}
          </React.Fragment>
        );
      })}
    </ContainerDroppable>
  );
};

export function FileTree({
  initialData = sampleData,
  onChange,
}: {
  initialData?: FileNode[];
  onChange?: (next: FileNode[]) => void;
}) {
  const [tree, setTree] = useState<FileNode[]>(initialData);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const walk = (nodes: FileNode[]) => {
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
  const { hoverId, onDragOverHoverOpen, resetHoverOpen } = useHoverOpen(id => {
    setExpanded(prev => new Set(prev).add(id));
  }, 700);

  // DnD
  const sensors = useStandardSensors(4);
  const depthMap = useMemo(() => buildDepthMap(tree), [tree]);

  const activeNode = activeId ? findNode(tree, activeId) : null;
  const activeLabel = activeNode?.name ?? '';

  return (
    <div
      className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm"
      onClick={clearSelection}
    >
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
          onDragOverHoverOpen(over?.id, String(active.id));
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
          onChange?.(nextTree);
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
            <DragChip
              icon={
                activeNode.icon === 'folder' ? (
                  <Folder className="size-3.5" />
                ) : (
                  <File className="size-3.5" />
                )
              }
              label={activeLabel}
              count={selected.size || undefined}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export default FileTree;

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { createContainerId, createFolderId, Droppable } from '@tgim/dnd/index';
import type { FileTreeData } from '@tgim/types/index';
import cn from '@tgim/utils/cn';
import Button from './Button';
import { ChevronDown, ChevronRight, File, Folder, MoreVertical } from 'lucide-react';
import React from 'react';

export const TreeNode: React.FC<{
  node: FileTreeData;
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
    id: createFolderId(node.id),
    disabled: !isFolder,
  });
  const setRefs = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };
  const highlight = hovered || isOver;

  return (
    <li ref={setRefs} className={cn('list-none', 'tree-node')}>
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

export const NodeList: React.FC<{
  parentId: string;
  nodes: FileTreeData[];
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
    <Droppable
      id={createContainerId(parentId)}
      dragging={dragging}
      render={() =>
        nodes.map(node => {
          const depth = depthMap.get(node.id) ?? 0;
          const expanded = expandedSet.has(node.id);
          const selected = selectedSet.has(node.id);
          return (
            <React.Fragment key={node.id}>
              <TreeNode
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
        })
      }
    />
  );
};

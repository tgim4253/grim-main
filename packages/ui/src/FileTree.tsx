import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { createContainerId, createFolderId, Droppable } from '@tgim/dnd/index';
import { NodeKind, type FileTreeData } from '@tgim/types/index';
import { ChevronDown, ChevronRight, File, Folder, MoreVertical } from 'lucide-react';
import cn from '@tgim/utils/cn';
import Button from './Button';

export const TreeNode: React.FC<{
  node: FileTreeData;
  depth: number;
  expanded: boolean;
  onToggle: (id: string) => void;
  hovered?: boolean;
  selected?: boolean;
  onClickOption?: (node: FileTreeData | undefined) => void;
  onSelect?: (e: React.MouseEvent, id: string) => void;
  openFile: (node: FileTreeData) => void;
}> = ({
  node,
  depth,
  expanded,
  onToggle,
  hovered,
  onClickOption,
  selected,
  onSelect,
  openFile,
}) => {
  const isFolder = node.type === NodeKind.Folder;
  const isFile = node.type === NodeKind.File;
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

  const indentStyle = { ['--depth' as any]: depth } as React.CSSProperties;

  return (
    <li ref={setRefs} className="tree-node" data-node-id={node.id}>
      <div
        className={cn(
          'tree-row',
          highlight ? 'is-highlighted' : '',
          selected ? 'is-selected' : '',
          isDragging ? 'is-dragging' : '',
        )}
        onClick={e => {
          onSelect?.(e, node.id);
          if (isFolder && !e.shiftKey && !e.metaKey && !e.ctrlKey) onToggle(node.id);
          if (isFile && !e.shiftKey && !e.metaKey && !e.ctrlKey) openFile(node);
        }}
        {...attributes}
        {...listeners}
      >
        <div className="indent" style={indentStyle}></div>
        {isFolder ? (
          <button
            className="toggle"
            onClick={e => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            type="button"
          >
            {expanded ? <ChevronDown className="icon" /> : <ChevronRight className="icon" />}
          </button>
        ) : (
          <span className="spacer" />
        )}

        <span aria-hidden="true">
          {isFolder ? <Folder className="icon" /> : <File className="icon" />}
        </span>

        <span className="name" title={node.name}>
          {node.name}
        </span>

        <Button
          variant="icon"
          aria-label="More actions"
          onClick={e => {
            e.stopPropagation();
            onClickOption?.(node);
          }}
        >
          <MoreVertical className="icon" />
        </Button>
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
  onClickOption?: (node: FileTreeData | undefined) => void;
  openFile: (node: FileTreeData) => void;
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
  onClickOption,
  openFile,
}) => {
  const orderedNodes = [...nodes].sort((a, b) => {
    const aHas = a.children == null ? 0 : 1;
    const bHas = b.children == null ? 0 : 1;
    return bHas - aHas;
  });

  return (
    <Droppable
      id={createContainerId(parentId)}
      dragging={dragging}
      render={() =>
        orderedNodes.map(node => {
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
                openFile={openFile}
                onClickOption={onClickOption}
              />
              {node.children?.length && expanded ? (
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
                  openFile={openFile}
                  onClickOption={onClickOption}
                />
              ) : null}
            </React.Fragment>
          );
        })
      }
    />
  );
};

export default NodeList;

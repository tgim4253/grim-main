import React from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  createContainerId,
  createFolderId,
  createNodeDragPayload,
  Droppable,
} from '@tgim/dnd/index';
import { CSSVariables, NodeKind, type FileTreeData } from '@tgim/types/index';
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  MoreVertical,
  RefreshCw,
} from 'lucide-react';
import cn from '@tgim/utils/cn';
import Button from './Button';
import { useDebouncedEffect } from '@tgim/hooks/useDebouncedEffect';

export const TreeNode: React.FC<{
  node: FileTreeData;
  depth: number;
  expanded: boolean;
  onToggle: (id: string) => void;
  hovered?: boolean;
  selected?: boolean;
  onClickOption?: (node: FileTreeData | undefined, action?: 'menu' | 'options') => void;
  onSelect?: (e: React.MouseEvent, id: string) => void;
  openFile: (node: FileTreeData) => void;
  selection: string[];
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
  selection,
}) => {
  const isFolder = node.type === NodeKind.Folder;
  const isFile = node.type === NodeKind.File;

  const [queuedToggle, setQueuedToggle] = React.useState(false);

  const runToggle = React.useCallback(() => {
    if (!queuedToggle) return;
    onToggle(node.id);
    setQueuedToggle(false); // reset after running
  }, [queuedToggle, onToggle, node.id]);

  useDebouncedEffect(runToggle, [queuedToggle], 200);

  const hasModifierKey = (event: React.MouseEvent) =>
    event.shiftKey || event.metaKey || event.ctrlKey || event.altKey;

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: node.id,
    data: createNodeDragPayload({
      nodeId: node.id,
      nodeKind: node.type,
      source: 'file-tree',
      selection,
      meta: { name: node.name, icon: node.icon },
    }),
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: createFolderId(node.id),
    disabled: !isFolder,
  });
  const setRefs = (el: HTMLElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };

  const highlight = hovered || isOver;

  const indentStyle: CSSVariables = { ['--depth']: depth };

  const status = node.status ?? 'normal';
  const hasSync = node.mounts?.some(mount => mount.syncEnabled) ?? false;
  const showWarning = status === 'warning';
  const showError = status === 'error';

  const handleOpenOptions = React.useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      onClickOption?.(node, 'options');
    },
    [node, onClickOption],
  );

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
          if (hasModifierKey(e)) return;

          if (isFolder) {
            setQueuedToggle(true);
          } else if (isFile) {
            openFile(node);
          }
        }}
        onDoubleClick={e => {
          if (hasModifierKey(e)) return;

          if (isFolder) {
            setQueuedToggle(false);
            if (!expanded) {
              onToggle(node.id);
            }
            openFile(node);
          } else if (isFile) {
            openFile(node);
          }
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

        <div className="ml-2 flex items-center gap-1">
          {hasSync ? <RefreshCw className="icon text-sky-400" aria-label="Sync enabled" /> : null}
          {showWarning ? (
            <button
              type="button"
              className="p-0.5 text-amber-400 hover:text-amber-300 focus:outline-none"
              onClick={handleOpenOptions}
              aria-label="Folder has changes"
            >
              <AlertTriangle className="icon" />
            </button>
          ) : null}
          {showError ? (
            <button
              type="button"
              className="p-0.5 text-red-500 hover:text-red-400 focus:outline-none"
              onClick={handleOpenOptions}
              aria-label="Folder inaccessible"
            >
              <AlertCircle className="icon" />
            </button>
          ) : null}
        </div>

        <Button
          variant="icon"
          aria-label="More actions"
          onClick={e => {
            e.stopPropagation();
            onClickOption?.(node, 'menu');
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
  onClickOption?: (node: FileTreeData | undefined, action?: 'menu' | 'options') => void;
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
  const selectedIds = React.useMemo(() => Array.from(selectedSet), [selectedSet]);

  return (
    <Droppable
      id={createContainerId(parentId)}
      dragging={dragging}
      render={() =>
        orderedNodes.map(node => {
          const depth = depthMap.get(node.id) ?? 0;
          const expanded = expandedSet.has(node.id);
          const selected = selectedSet.has(node.id);
          const selection = selected ? selectedIds : [node.id];

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
                selection={selection}
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

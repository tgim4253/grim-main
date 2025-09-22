import React, { useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { createContainerId, createFolderId, Droppable } from '@tgim/dnd/index';
import { FileType, NodeKind, type FileTreeData } from '@tgim/types/index';
import { ChevronDown, ChevronRight, File, Folder, MoreVertical } from 'lucide-react';
import cn from '@tgim/utils/cn';
import Button from './Button';

const LEAF_GROUP_THRESHOLD = 10;

const FILE_TYPE_LABELS: Record<FileType, string> = {
  [FileType.Image]: '이미지',
  [FileType.Video]: '비디오',
  [FileType.Document]: '문서',
  [FileType.GraphicTool]: '그래픽',
  [FileType.Audio]: '오디오',
  [FileType.Archive]: '압축',
  [FileType.Unknown]: '기타',
};

const formatFileTypeLabel = (fileType: FileType) =>
  FILE_TYPE_LABELS[fileType] ?? fileType.charAt(0).toUpperCase() + fileType.slice(1);

type GroupOptions = {
  disableGrouping?: boolean;
  threshold?: number;
};

const groupLeafNodes = (
  parentId: string,
  nodes: FileTreeData[],
  options: GroupOptions = {},
): FileTreeData[] => {
  const { disableGrouping = false, threshold = LEAF_GROUP_THRESHOLD } = options;
  if (disableGrouping || !nodes.length) return nodes;

  const meta = new Map<FileType, { indices: number[]; nodes: FileTreeData[] }>();
  const nodeTypes = nodes.map((node, index) => {
    if (node.children?.length || !node.fileType) return null;
    const entry = meta.get(node.fileType) ?? { indices: [], nodes: [] };
    entry.indices.push(index);
    entry.nodes.push(node);
    meta.set(node.fileType, entry);
    return node.fileType;
  });

  if (!meta.size) return nodes;

  const handled = new Set<FileType>();
  const result: FileTreeData[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const fileType = nodeTypes[index];
    if (!fileType) {
      result.push(node);
      continue;
    }

    const entry = meta.get(fileType);
    if (!entry || entry.nodes.length < threshold) {
      result.push(node);
      continue;
    }

    if (handled.has(fileType)) {
      continue;
    }

    handled.add(fileType);

    const label = formatFileTypeLabel(fileType);
    result.push({
      id: `group:${parentId}:${fileType}`,
      name: `${label} (${entry.nodes.length})`,
      icon: 'folder',
      type: NodeKind.Folder,
      children: entry.nodes,
      isGroup: true,
      groupType: fileType,
    });
  }

  return result;
};

export const getVisibleNodeIds = (
  tree: FileTreeData[],
  expanded: Set<string>,
  options: { threshold?: number } = {},
) => {
  const { threshold } = options;
  const ids: string[] = [];

  const walk = (nodes: FileTreeData[], parentId: string, disableGrouping: boolean) => {
    const grouped = groupLeafNodes(parentId, nodes, { disableGrouping, threshold });
    for (const node of grouped) {
      ids.push(node.id);
      if (node.children?.length && expanded.has(node.id)) {
        walk(node.children, node.id, disableGrouping || !!node.isGroup);
      }
    }
  };

  walk(tree, 'root', false);

  return ids;
};

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
  const isGroup = !!node.isGroup;
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: node.id, disabled: isGroup });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: createFolderId(node.id),
    disabled: !isFolder || isGroup,
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
          const hasModifier = e.shiftKey || e.metaKey || e.ctrlKey;

          if (isGroup) {
            e.stopPropagation();
            if (!hasModifier) onToggle(node.id);
            return;
          }

          onSelect?.(e, node.id);
          if (isFolder && !hasModifier) onToggle(node.id);
          if (isFile && !hasModifier) openFile(node);
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

        {!isGroup ? (
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
        ) : null}
      </div>
    </li>
  );
};

export const NodeList: React.FC<{
  parentId: string;
  depth: number;
  nodes: FileTreeData[];
  expandedSet: Set<string>;
  onToggle: (id: string) => void;
  dragging: boolean;
  hoverId: string | null;
  selectedSet: Set<string>;
  onSelect: (e: React.MouseEvent, id: string) => void;
  onClickOption?: (node: FileTreeData | undefined) => void;
  openFile: (node: FileTreeData) => void;
  disableGrouping?: boolean;
}> = ({
  parentId,
  depth,
  nodes,
  expandedSet,
  onToggle,
  dragging,
  hoverId,
  selectedSet,
  onSelect,
  onClickOption,
  openFile,
  disableGrouping = false,
}) => {
  const displayNodes = useMemo(
    () => groupLeafNodes(parentId, nodes, { disableGrouping }),
    [parentId, nodes, disableGrouping],
  );

  const orderedNodes = useMemo(() => {
    return [...displayNodes].sort((a, b) => {
      const aHas = a.children == null ? 0 : 1;
      const bHas = b.children == null ? 0 : 1;
      return bHas - aHas;
    });
  }, [displayNodes]);

  return (
    <Droppable
      id={createContainerId(parentId)}
      dragging={dragging}
      render={() =>
        orderedNodes.map(node => {
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
                  depth={depth + 1}
                  nodes={node.children}
                  expandedSet={expandedSet}
                  onToggle={onToggle}
                  dragging={dragging}
                  hoverId={hoverId}
                  selectedSet={selectedSet}
                  onSelect={onSelect}
                  openFile={openFile}
                  onClickOption={onClickOption}
                  disableGrouping={node.isGroup}
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

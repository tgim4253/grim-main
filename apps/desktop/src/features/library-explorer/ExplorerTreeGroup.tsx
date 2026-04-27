import { ExplorerTreeRow } from './ExplorerTreeRow';
import { ExplorerTreeDraftRow } from './ExplorerTreeDraftRow';
import type { ExplorerFolderDraft, ExplorerNode } from './types';

type ExplorerTreeGroupProps = {
  node: ExplorerNode;
  level?: number;
  activeNodeId: string;
  expandedById: Readonly<Record<string, boolean>>;
  draft?: ExplorerFolderDraft | null;
  actionsDisabled?: boolean;
  onNodeSelect: (node: ExplorerNode) => void;
  onNodeFocus: (node: ExplorerNode) => void;
  onAddFolder?: () => void;
  onRefresh?: () => void;
  onDraftCommit: (name: string) => void;
  onDraftCancel: () => void;
};

export function ExplorerTreeGroup({
  node,
  level = 1,
  activeNodeId,
  expandedById,
  draft = null,
  actionsDisabled = false,
  onNodeSelect,
  onNodeFocus,
  onAddFolder,
  onRefresh,
  onDraftCommit,
  onDraftCancel,
}: ExplorerTreeGroupProps) {
  const isDraftParent = draft?.parentNodeId === node.id;
  const hasChildren = Boolean(node.children?.length) || isDraftParent;
  const isExpanded = hasChildren && (expandedById[node.id] || isDraftParent);

  return (
    <div className="explorer-tree-group">
      <ExplorerTreeRow
        level={level}
        label={node.label}
        meta={node.meta}
        icon={node.icon}
        active={activeNodeId === node.id}
        expanded={isExpanded}
        hasChildren={hasChildren}
        showActions={node.showActions}
        actionsDisabled={actionsDisabled}
        onClick={() => {
          onNodeSelect(node);
        }}
        onFocus={() => {
          onNodeFocus(node);
        }}
        onAddFolder={onAddFolder}
        onRefresh={onRefresh}
      />

      {isExpanded ? (
        <div className="explorer-tree-group__nested" role="group">
          <div className="explorer-tree-group__divider" aria-hidden="true" />

          <div className="explorer-tree-group__stack">
            {node.children?.map(child => (
              <ExplorerTreeGroup
                key={child.id}
                node={child}
                level={level + 1}
                activeNodeId={activeNodeId}
                expandedById={expandedById}
                draft={draft}
                actionsDisabled={actionsDisabled}
                onNodeSelect={onNodeSelect}
                onNodeFocus={onNodeFocus}
                onAddFolder={onAddFolder}
                onRefresh={onRefresh}
                onDraftCommit={onDraftCommit}
                onDraftCancel={onDraftCancel}
              />
            ))}
            {isDraftParent ? (
              <ExplorerTreeDraftRow
                level={level + 1}
                pending={draft.pending}
                error={draft.error}
                onCommit={onDraftCommit}
                onCancel={onDraftCancel}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

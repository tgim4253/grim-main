import { ExplorerTreeRow } from './ExplorerTreeRow';
import type { ExplorerNode } from './types';

type ExplorerTreeGroupProps = {
  node: ExplorerNode;
  level?: number;
  activeNodeId: string;
  expandedById: Readonly<Record<string, boolean>>;
  onNodeSelect: (node: ExplorerNode) => void;
};

export function ExplorerTreeGroup({
  node,
  level = 1,
  activeNodeId,
  expandedById,
  onNodeSelect,
}: ExplorerTreeGroupProps) {
  const hasChildren = Boolean(node.children?.length);
  const isExpanded = hasChildren && expandedById[node.id];

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
        onClick={() => {
          onNodeSelect(node);
        }}
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
                onNodeSelect={onNodeSelect}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

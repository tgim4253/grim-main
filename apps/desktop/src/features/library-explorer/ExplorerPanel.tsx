import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../shared/ui';
import { ExplorerTreeGroup } from './ExplorerTreeGroup';
import type { ExplorerNode } from './types';
import './explorer.css';

function buildDefaultExpandedState(nodes: ExplorerNode[]): Record<string, boolean> {
  return nodes.reduce<Record<string, boolean>>((state, node) => {
    if (node.children?.length) {
      state[node.id] = Boolean(node.defaultExpanded);
      Object.assign(state, buildDefaultExpandedState(node.children));
    }

    return state;
  }, {});
}

type ExplorerPanelProps = {
  nodes: ExplorerNode[];
  activeNodeId: string;
  loading?: boolean;
  error?: string | null;
  onNodeSelect: (node: ExplorerNode) => void;
  onRetry?: () => void;
};

export function ExplorerPanel({
  nodes,
  activeNodeId,
  loading = false,
  error = null,
  onNodeSelect,
  onRetry,
}: ExplorerPanelProps) {
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>(() =>
    buildDefaultExpandedState(nodes),
  );

  useEffect(() => {
    setExpandedById(buildDefaultExpandedState(nodes));
  }, [nodes]);

  const handleNodeSelect = useCallback(
    (node: ExplorerNode) => {
      if (node.source) {
        onNodeSelect(node);
      }

      if (node.children?.length) {
        setExpandedById(current => ({ ...current, [node.id]: !current[node.id] }));
      }
    },
    [onNodeSelect],
  );

  return (
    <div className="library-explorer">
      <div className="library-explorer__import-action">
        <Button className="library-explorer__import-button" size="sm" width="fill">
          Import
        </Button>
      </div>

      <div className="library-explorer__tree" role="tree" aria-label="Explorer">
        {error ? (
          <div className="library-explorer__state" role="status">
            <p>{error}</p>
            {onRetry ? (
              <Button size="sm" onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : loading && nodes.length === 0 ? (
          <div className="library-explorer__state" role="status">
            <p>Loading library...</p>
          </div>
        ) : (
          nodes.map(node => (
            <ExplorerTreeGroup
              key={node.id}
              node={node}
              activeNodeId={activeNodeId}
              expandedById={expandedById}
              onNodeSelect={handleNodeSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

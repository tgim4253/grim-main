import { useCallback, useState } from 'react';
import { Button } from '../../shared/ui';
import { ExplorerTreeGroup } from './ExplorerTreeGroup';
import {
  EXPLORER_DUMMY_NODES,
  EXPLORER_INITIAL_ACTIVE_NODE_ID,
  type ExplorerNode,
} from './explorerDummyData';
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

const DEFAULT_EXPANDED_STATE = buildDefaultExpandedState(EXPLORER_DUMMY_NODES);

export function ExplorerPanel() {
  const [activeNodeId, setActiveNodeId] = useState(EXPLORER_INITIAL_ACTIVE_NODE_ID);
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>(DEFAULT_EXPANDED_STATE);

  const handleNodeSelect = useCallback((node: ExplorerNode) => {
    if (node.children?.length) {
      setExpandedById(current => ({ ...current, [node.id]: !current[node.id] }));
      return;
    }

    setActiveNodeId(current => (current === node.id ? current : node.id));
  }, []);

  return (
    <div className="library-explorer">
      <div className="library-explorer__import-action">
        <Button className="library-explorer__import-button" size="sm" width="fill">
          Import
        </Button>
      </div>

      <div className="library-explorer__tree" role="tree" aria-label="Explorer">
        {EXPLORER_DUMMY_NODES.map(node => (
          <ExplorerTreeGroup
            key={node.id}
            node={node}
            activeNodeId={activeNodeId}
            expandedById={expandedById}
            onNodeSelect={handleNodeSelect}
          />
        ))}
      </div>
    </div>
  );
}

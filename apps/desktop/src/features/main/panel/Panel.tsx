import { usePanelsStore } from '@tgim/stores/index';
import { memo, useCallback, useEffect, useState } from 'react';
import { shallow, useShallow } from 'zustand/shallow';
import ReactDOM from 'react-dom';
import { ipc } from '../../../lib/ipc';
import { useMoa } from '@tgim/hooks/useMoa';
import GraphView from './panels/GraphView';
import { GraphData, GraphResponse } from '@tgim/types/graph';

interface PanelProps {
  panelId: string;
  hidden?: boolean;
}

type ViewType = 'graph' | 'node';

const Panel: React.FC<PanelProps> = ({ panelId, hidden }) => {
  const [viewType, setViewType] = useState<ViewType>('graph');
  const [graphData, setGraphData] = useState<GraphData | null>(null);

  const { panel, containerId, isActive } = usePanelsStore(
    useShallow(state => ({
      panel: state.panelEntities[panelId],
      containerId: state.panelOwnership[panelId],
      isActive: state.activePanelId === panelId,
    })),
  );
  const { moaId } = useMoa(location);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    console.log(panelId, 'created');
    if (containerId) {
      const el = document.getElementById(containerId);

      if (el) setContainer(el);
    }
  }, [containerId]);

  const transformData = useCallback((data: GraphResponse) => {
    console.log(data);
    const nodes = data.nodes.map(node => {
      return {
        id: node.id,
        label: node.kind,
        data: node,
      };
    });

    console.log(data.connections);
    const connections = data.connections.map(connection => {
      console.log(connection);
      return {
        source: connection.src_node_id,
        target: connection.dst_node_id,
        label: connection.kind,
        data: connection,
      };
    });

    console.log(nodes, connections);

    return {
      nodes,
      links: connections,
    };
  }, []);

  if (!panel || !container) return null;

  return ReactDOM.createPortal(
    <div
      className={`p-2 rounded border w-full h-full 
        ${isActive ? 'border-blue-500' : 'border-gray-300'} 
        ${hidden ? 'hidden' : ''}`}
      onClick={async () => {
        if (!moaId) return;
        try {
          const data = await ipc.graph.getGraphOne(moaId, panel.nodeId.toString());
          setGraphData(transformData(data));
        } catch (e) {
          console.error(e);
        }
      }}
    >
      {viewType === 'graph' ? graphData && <GraphView graphData={graphData} /> : null}
    </div>,
    container,
  );
};

export default memo(Panel);

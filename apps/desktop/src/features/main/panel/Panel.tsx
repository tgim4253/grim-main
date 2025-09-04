import { usePanelsStore } from '@tgim/stores/index';
import { memo, useCallback, useEffect, useState } from 'react';
import { shallow, useShallow } from 'zustand/shallow';
import ReactDOM from 'react-dom';
import { ipc } from '../../../lib/ipc';
import { useMoa } from '@tgim/hooks/useMoa';
import GraphView from './panels/GraphView';
import {
  FileType,
  GraphData,
  GraphNode,
  GraphNodeType,
  GraphResponse,
  NodeFile,
  NodeFolder,
  NodeKind,
} from '@tgim/types/graph';

interface PanelProps {
  panelId: string;
  hidden?: boolean;
}

type ViewType = 'graph' | 'node';

const Panel: React.FC<PanelProps> = ({ panelId, hidden }) => {
  const [viewType, setViewType] = useState<ViewType>('graph');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [rootNodeId, setRootNodeId] = useState<string | null>(null);

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
    if (containerId) {
      const el = document.getElementById(containerId);

      if (el) setContainer(el);
    }
  }, [containerId]);
  useEffect(() => {
    if (!moaId) return;
    let as = async () => {
      try {
        const data = await ipc.graph.getGraphOne(moaId, panel.nodeId.toString());
        setGraphData(transformData(data));
      } catch (e) {
        console.error(e);
      }
    };
    as();
  }, [moaId]);
  const transformData = useCallback((graphData: GraphResponse): GraphData => {
    setRootNodeId(graphData.root_node_id);
    console.log(graphData);
    const nodes: GraphNode[] = graphData.nodes.map(node => {
      const defaultSize = 10;
      const nodeSize = node.id == graphData.root_node_id ? defaultSize * 1.7 : defaultSize;

      if (node.kind == NodeKind.File && node.data['File']) {
        let data = node.data['File'];

        let type: GraphNodeType = 'default';

        if (data.kind == FileType.Image) {
          type = 'image';
        } else if (data.kind == FileType.Document) {
          type = 'document';
        }
        return {
          id: node.id,
          label: data.file_name ?? 'file',
          size: nodeSize,
          type: type,
        };
      } else if (node.kind == NodeKind.Folder && node.data['Folder']) {
        let data = node.data['Folder'];

        return {
          id: node.id,
          label: data.folder_name ?? 'folder',
          size: nodeSize,
          type: 'folder',
        };
      }

      return {
        id: node.id,
        label: node.kind,
        size: nodeSize,
        type: 'default',
      };
    });

    const connections = graphData.connections.map(connection => {
      return {
        source: connection.src_node_id,
        target: connection.dst_node_id,
        label: connection.kind,
        data: connection,
      };
    });

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
    >
      {viewType === 'graph'
        ? graphData && <GraphView rootNodeId={rootNodeId} graphData={graphData} />
        : null}
    </div>,
    container,
  );
};

export default memo(Panel);

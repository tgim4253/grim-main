import { usePanelsStore } from '@tgim/stores/index';
import { memo, useCallback, useEffect, useState } from 'react';
import { shallow, useShallow } from 'zustand/shallow';
import ReactDOM from 'react-dom';
import { ipc } from '../../../lib/ipc';
import { useMoa } from '@tgim/hooks/useMoa';
import GraphView from './panels/GraphView';
import {
  Connection,
  FileType,
  GraphConnection,
  GraphData,
  GraphNode,
  GraphNodeType,
  GraphResponse,
  Node,
  NodeFile,
  NodeFolder,
  NodeKind,
} from '@tgim/types/graph';
import { createNewId } from '@tgim/utils/identifier';

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

    const nodesMap: Record<string, Node> = {};
    graphData.nodes.forEach(node => {
      nodesMap[node.id] = node;
    });
    const connectionsMap: Record<string, Connection[]> = {};
    graphData.connections.forEach(connection => {
      if (!connectionsMap[connection.src_node_id]) {
        connectionsMap[connection.src_node_id] = [];
      }
      connectionsMap[connection.src_node_id].push(connection);
    });

    console.log(nodesMap);
    console.log(connectionsMap);
    const nodes: GraphNode[] = [];
    const links: GraphConnection[] = [];

    const getNodeData = (node: Node, graphNodeId?: string) => {
      const defaultSize = 10;
      const nodeSize = node.id == graphData.root_node_id ? defaultSize * 1.7 : defaultSize;
      if (!graphNodeId) graphNodeId = createNewId();

      if (node.kind == NodeKind.File && node.data['File']) {
        let data = node.data['File'];

        let type: GraphNodeType = 'default';

        if (data.kind == FileType.Image) {
          type = 'image';
        } else if (data.kind == FileType.Document) {
          type = 'document';
        }
        return {
          id: graphNodeId,
          nodeId: node.id,
          label: data.file_name ?? 'file',
          size: nodeSize,
          type: type,
        };
      } else if (node.kind == NodeKind.Folder && node.data['Folder']) {
        let data = node.data['Folder'];

        return {
          id: graphNodeId,
          nodeId: node.id,
          label: data.folder_name ?? 'folder',
          size: nodeSize,
          type: 'folder',
        };
      }

      return {
        id: graphNodeId,
        nodeId: node.id,
        label: node.kind,
        size: nodeSize,
        type: 'default',
      };
    };

    const createNode = (startNodeId: string): string => {
      // Stack holds work items to expand, along with the parent relation
      const stack: Array<{
        origId: string; // original node id to materialize
        parentNewId?: string; // newly created id of parent (if any)
        via?: Connection; // connection from parent -> this node
        prevLevel?: number;
      }> = [{ origId: startNodeId }];

      // We will create a brand-new node for EVERY stack item, even if origId repeats.
      // This mirrors the original recursive function (children are not shared).
      let rootNewId: string | undefined;

      while (stack.length > 0) {
        const { origId, parentNewId, via, prevLevel } = stack.pop()!;

        // 1) Create a fresh node id and materialize the node
        const newId = createNewId();
        const node = nodesMap[origId];
        nodes.push(getNodeData(node, newId));

        // Capture root id (the very first item expanded has no parent)
        if (!parentNewId && rootNewId === undefined) {
          rootNewId = newId;
        }

        // 2) If we came from a parent, create the link now
        if (parentNewId && via) {
          // backward
          if (via.level == 3) {
            links.push({
              source: newId,
              target: parentNewId,
              label: via.kind,
              data: via,
            });
          } else {
            // foward or bidirectional
            links.push({
              source: parentNewId,
              target: newId,
              label: via.kind,
              data: via,
            });
          }
        }

        // 3) Enqueue children; they will each create brand-new nodes
        const connections: Connection[] = connectionsMap[origId] ?? [];
        for (const connection of connections) {
          if (prevLevel !== 3)
            stack.push({
              origId: connection.dst_node_id,
              parentNewId: newId,
              via: connection,
              prevLevel: connection.level,
            });
        }
      }

      // rootNewId must exist because startNodeId produced at least one node
      return rootNewId!;
    };

    createNode(graphData.root_node_id);
    return {
      nodes,
      links,
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

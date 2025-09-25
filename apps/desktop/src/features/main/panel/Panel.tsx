import { usePanelsStore } from '@tgim/stores/index';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { shallow, useShallow } from 'zustand/shallow';
import ReactDOM from 'react-dom';
import { ipc } from '../../../lib/ipc';
import { useMoa } from '@tgim/hooks/useMoa';
import GraphView from './panels/GraphView';
import {
  Connection,
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
import GridView from './panels/GridView';
import { GridData, ImageItem } from '@tgim/types/grid';
import { listen } from '@tauri-apps/api/event';
import { FileType, ThumbResSpec } from '@tgim/types/file';
import { Button } from '@tgim/ui';
import cn from '@tgim/utils/cn';
import { GitBranch, LayoutGrid } from 'lucide-react';

interface PanelProps {
  panelId: string;
  hidden?: boolean;
}

type ViewType = 'graph' | 'node' | 'grid';

const Panel: React.FC<PanelProps> = ({ panelId, hidden }) => {
  const [viewType, setViewType] = useState<ViewType>('graph');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [gridData, setGridData] = useState<GridData | null>(null);
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
        setGraphData(transformDataToGraphData(data));
        setGridData(await transformDataToGridData(data));
      } catch (e) {
        console.error(e);
      }
    };
    as();
  }, [moaId]);
  const transformDataToGraphData = useCallback((graphData: GraphResponse): GraphData => {
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

    const nodes: GraphNode[] = [];
    const links: GraphConnection[] = [];

    const getGraphNodeData = (node: Node, graphNodeId?: string): GraphNode => {
      const defaultSize = 14;
      const nodeSize = node.id == graphData.root_node_id ? defaultSize * 1.6 : defaultSize;
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
          hash: data.xxh3_64,
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

    ((startNodeId: string, maxDepth?: number): string => {
      // Stack holds work items to expand, along with the parent relation
      const stack: Array<{
        origId: string; // original node id to materialize
        parentNewId?: string; // newly created id of parent (if any)
        via?: Connection; // connection from parent -> this node
        depth: number;
        prevLevel?: number;
      }> = [{ origId: startNodeId, depth: 0 }];

      // We will create a brand-new node for EVERY stack item, even if origId repeats.
      // This mirrors the original recursive function (children are not shared).
      let rootNewId: string | undefined;

      const seen: Set<string> = new Set();

      while (stack.length > 0) {
        const { origId, parentNewId, via, prevLevel, depth } = stack.pop()!;
        if (seen.has(origId)) continue;
        seen.add(origId);

        if (maxDepth && depth > maxDepth) continue;

        // 1) Create a fresh node id and materialize the node
        const newId = createNewId();
        const node = nodesMap[origId];
        const newNode = getGraphNodeData(node, newId);
        newNode.depth = depth;
        if (node.id == graphData.root_node_id) {
          newNode.fx = 0;
          newNode.fy = 0;
        }
        // Capture root id (the very first item expanded has no parent)
        if (!parentNewId && rootNewId === undefined) {
          rootNewId = newId;
        }

        // 2) If we came from a parent, create the link now
        if (parentNewId && via) {
          links.push({
            source: parentNewId,
            target: newId,
            label: via.kind,
            data: via,
          });
        }
        // 3) Enqueue children; they will each create brand-new nodes
        const connections: Connection[] = connectionsMap[origId] ?? [];
        newNode.isLeaf = connections.length == 0;
        nodes.push(newNode);

        for (const connection of connections) {
          if (prevLevel !== 3)
            stack.push({
              origId: connection.dst_node_id,
              parentNewId: newId,
              via: connection,
              prevLevel: connection.level,
              depth: depth + 1,
            });
        }
      }

      // rootNewId must exist because startNodeId produced at least one node
      return rootNewId!;
    })(graphData.root_node_id, 99);

    return {
      nodes,
      links,
    };
  }, []);
  const transformDataToGridData = useCallback(async (data: GraphResponse): Promise<GridData> => {
    const items = data.nodes.filter(node => node.id !== data.root_node_id);
    const imageItems: ImageItem[] = [];
    items.forEach(item => {
      if (item.kind == NodeKind.File && item.data['File']) {
        let data = item.data['File'];
        if (data.kind != FileType.Image) return;
        imageItems.push({
          id: createNewId(),
          nodeId: item.id,
          name: data.file_name,
          type: data.kind,
          size: data.size,
          hash: data.xxh3_64,
        });
      }
    });

    return { images: imageItems };
  }, []);

  const rootGraphNodeId = useMemo(() => {
    if (!graphData) return null;
    let id = null;
    graphData.nodes.forEach(node => {
      if (node.nodeId == rootNodeId) {
        id = node.id;
      }
    });
    return id;
  }, [graphData, rootNodeId]);
  if (!panel || !container) return null;

  const showGraph = viewType === 'graph' && graphData && rootNodeId && rootGraphNodeId;
  const showGrid = viewType === 'grid' && !!gridData;

  return ReactDOM.createPortal(
    <div
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-xl border bg-surface shadow-sm transition-colors',
        isActive ? 'border-accent' : 'border-border',
        hidden && 'hidden',
      )}
    >
      <div className="flex items-center justify-end border-b border-border bg-surface-raised px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-muted p-1 shadow-inner">
          <Button
            type="button"
            variant="icon"
            active={viewType === 'graph'}
            aria-pressed={viewType === 'graph'}
            aria-label="그래프 보기"
            title="그래프 보기"
            onClick={() => setViewType('graph')}
            className="h-8 w-8"
          >
            <GitBranch className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="icon"
            active={viewType === 'grid'}
            aria-pressed={viewType === 'grid'}
            aria-label="그리드 보기"
            title="그리드 보기"
            onClick={() => setViewType('grid')}
            className="h-8 w-8"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0 bg-surface">
        {showGraph ? (
          <GraphView
            rootNodeId={rootNodeId}
            rootGraphNodeId={rootGraphNodeId}
            graphData={graphData}
          />
        ) : showGrid && gridData ? (
          <GridView gridData={gridData} />
        ) : null}
      </div>
    </div>,
    container,
  );
};

export default memo(Panel);

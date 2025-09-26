import { usePanelsStore } from '@tgim/stores/index';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { FileType, ThumbResSpec } from '@tgim/types/file';
import { Button } from '@tgim/ui';
import cn from '@tgim/utils/cn';
import { Split } from '@tgim/ui/Splitter';
import FileDetailSidebar from './panels/FileDetailSidebar';
import { Eye, GitBranch, LayoutGrid } from 'lucide-react';
import FileViewer from './panels/FileViewer';
import { usePanelDrop } from './usePanelDrop';

interface PanelProps {
  panelId: string;
  hidden?: boolean;
}

type ViewType = 'graph' | 'grid' | 'viewer';

const Panel: React.FC<PanelProps> = ({ panelId, hidden }) => {
  const [viewType, setViewType] = useState<ViewType>('graph');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [rootNodeId, setRootNodeId] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<ImageItem | null>(null);
  const [rootNode, setRootNode] = useState<Node | null>(null);
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);
  const [gridRefreshKey, setGridRefreshKey] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { panel, containerId, isActive } = usePanelsStore(
    useShallow(state => ({
      panel: state.panelEntities[panelId],
      containerId: state.panelOwnership[panelId],
      isActive: state.activePanelId === panelId,
    })),
  );
  const { moaId } = useMoa(location);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const transformDataToGraphData = useCallback((graphData: GraphResponse): GraphData => {
    setRootNodeId(graphData.rootNodeId);
    setRootNode(graphData.nodes.find(node => node.id === graphData.rootNodeId) ?? null);

    const nodesMap: Record<string, Node> = {};
    graphData.nodes.forEach(node => {
      nodesMap[node.id] = node;
    });
    const connectionsMap: Record<string, Connection[]> = {};
    graphData.connections.forEach(connection => {
      if (!connectionsMap[connection.srcNodeId]) {
        connectionsMap[connection.srcNodeId] = [];
      }
      connectionsMap[connection.srcNodeId].push(connection);
    });

    const nodes: GraphNode[] = [];
    const links: GraphConnection[] = [];

    const getGraphNodeData = (node: Node, graphNodeId?: string): GraphNode => {
      const defaultSize = 14;
      const nodeSize = node.id == graphData.rootNodeId ? defaultSize * 1.6 : defaultSize;
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
          label: data.fileName ?? 'file',
          size: nodeSize,
          type: type,
          hash: data.xxh364,
        };
      } else if (node.kind == NodeKind.Folder && node.data['Folder']) {
        let data = node.data['Folder'];

        return {
          id: graphNodeId,
          nodeId: node.id,
          label: data.folderName ?? 'folder',
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

      while (stack.length > 0) {
        const { origId, parentNewId, via, prevLevel, depth } = stack.pop()!;

        if (maxDepth && depth > maxDepth) continue;

        // 1) Create a fresh node id and materialize the node
        const newId = createNewId();
        const node = nodesMap[origId];
        const newNode = getGraphNodeData(node, newId);
        newNode.depth = depth;
        if (node.id == graphData.rootNodeId) {
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
              origId: connection.dstNodeId,
              parentNewId: newId,
              via: connection,
              prevLevel: connection.level,
              depth: depth + 1,
            });
        }
      }

      // rootNewId must exist because startNodeId produced at least one node
      return rootNewId!;
    })(graphData.rootNodeId, 99);

    return {
      nodes,
      links,
    };
  }, []);
  const transformDataToGridData = useCallback(async (data: GraphResponse): Promise<GridData> => {
    const items = data.nodes.filter(node => node.id !== data.rootNodeId);
    const imageItems: ImageItem[] = [];
    items.forEach(item => {
      if (item.kind == NodeKind.File && item.data['File']) {
        let data = item.data['File'];
        if (data.kind != FileType.Image) return;
        imageItems.push({
          id: createNewId(),
          nodeId: item.id,
          name: data.fileName,
          type: data.kind,
          size: data.size,
          hash: data.xxh364,
        });
      }
    });

    return { images: imageItems };
  }, []);
  useEffect(() => {
    if (containerId) {
      const el = document.getElementById(containerId);

      if (el) setContainer(el);
    }
  }, [containerId]);
  const refreshPanelData = useCallback(async () => {
    if (!moaId) return;
    try {
      const data = await ipc.graph.getGraphOne(moaId, panel.nodeId.toString());
      setRootNode(data.nodes.find(node => node.id === data.rootNodeId) ?? null);
      setGraphData(transformDataToGraphData(data));
      setGridData(await transformDataToGridData(data));
      setGraphRefreshKey(prev => prev + 1);
      setGridRefreshKey(prev => prev + 1);
    } catch (e) {
      console.error('Failed to load panel data', e);
    }
  }, [moaId, panel.nodeId, transformDataToGraphData, transformDataToGridData]);

  useEffect(() => {
    void refreshPanelData();
  }, [refreshPanelData]);

  useEffect(() => {
    if (!moaId || !panel?.nodeId) return;

    let isCancelled = false;

    const load = async () => {
      try {
        const data = await ipc.graph.getGraphOne(moaId, panel.nodeId.toString());
        const nextGraphData = transformDataToGraphData(data);
        const nextGridData = await transformDataToGridData(data);

        if (isCancelled) return;

        setGraphData(nextGraphData);
        setGridData(nextGridData);
        setGraphRefreshKey(prev => prev + 1);
        setGridRefreshKey(prev => prev + 1);
      } catch (e) {
        console.error(e);
      }
    };

    void load();

    return () => {
      isCancelled = true;
    };
  }, [moaId, panel?.nodeId, transformDataToGraphData, transformDataToGridData]);

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

  useEffect(() => {
    if (!gridData || !activeImage) return;
    const exists = gridData.images.some(img => img.hash === activeImage.hash);
    if (!exists) {
      setActiveImage(null);
    }
  }, [gridData, activeImage?.hash]);

  useEffect(() => {
    if (!gridData) {
      setActiveImage(null);
    }
  }, [gridData]);

  useEffect(() => {
    if (viewType !== 'grid') {
      setActiveImage(null);
    }
  }, [viewType]);
  const availableViews = useMemo<ViewType[]>(() => {
    if (rootNode?.kind === NodeKind.Folder) {
      return ['grid', 'graph'];
    }
    if (rootNode?.kind === NodeKind.File) {
      return ['viewer', 'graph'];
    }
    return ['graph'];
  }, [rootNode?.kind]);

  const defaultView = useMemo<ViewType>(() => availableViews[0] ?? 'graph', [availableViews]);

  useEffect(() => {
    if (!availableViews.includes(viewType)) {
      setViewType(defaultView);
    }
  }, [availableViews, defaultView, viewType]);

  const rootFile = useMemo<NodeFile | null>(() => {
    if (rootNode?.kind !== NodeKind.File) return null;
    return rootNode.data?.['File'] ?? null;
  }, [rootNode]);

  const rootFolder = useMemo(() => {
    if (!rootNode) return null;
    if (rootNode.kind !== NodeKind.Folder) return null;
    return rootNode.data['Folder'] ?? null;
  }, [rootNode]);

  const dropEnabled = useMemo(() => Boolean(rootFolder && moaId), [rootFolder, moaId]);

  const { isDropActive, handleDrop, handleDragEnter, handleDragLeave, handleDragOver } =
    usePanelDrop({
      dropEnabled,
      rootNodeId,
      moaId: moaId ?? null,
      refreshPanelData,
    });

  const showGraph = viewType === 'graph' && graphData && rootNodeId && rootGraphNodeId;
  const showGrid = viewType === 'grid' && !!gridData && availableViews.includes('grid');
  const showViewer = viewType === 'viewer' && !!rootFile;

  const getViewIcon = useCallback((type: ViewType) => {
    switch (type) {
      case 'grid':
        return LayoutGrid;
      case 'viewer':
        return Eye;
      case 'graph':
      default:
        return GitBranch;
    }
  }, []);

  if (!panel || !container) return null;

  return ReactDOM.createPortal(
    <div
      ref={panelRef}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragStart={ev => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.setData('text/plain', 'yo');
        ev.dataTransfer.effectAllowed = 'all';
        ev.dataTransfer.dropEffect = 'move';
      }}
      onDragLeave={handleDragLeave}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-xl border bg-surface shadow-sm transition-colors',
        isActive ? 'border-accent' : 'border-border',
        hidden && 'hidden',
        dropEnabled && isDropActive && 'ring-2 ring-accent/60',
      )}
    >
      <div className="flex items-center justify-end border-b border-border bg-surface-raised px-3 py-2">
        {availableViews.length > 1 ? (
          <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-muted p-1 shadow-inner">
            {availableViews.map(type => {
              const Icon = getViewIcon(type);
              const isActive = viewType === type;
              const labels: Record<ViewType, string> = {
                graph: '그래프 보기',
                grid: '그리드 보기',
                viewer: '뷰어 보기',
              };

              return (
                <Button
                  key={type}
                  type="button"
                  variant="icon"
                  active={isActive}
                  aria-pressed={isActive}
                  aria-label={labels[type]}
                  title={labels[type]}
                  onClick={() => setViewType(type)}
                  className="h-8 w-8"
                >
                  <Icon className="h-4 w-4" />
                </Button>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="relative flex-1 min-h-0 bg-surface">
        {showGraph ? (
          <GraphView
            key={graphRefreshKey}
            rootNodeId={rootNodeId}
            rootGraphNodeId={rootGraphNodeId}
            graphData={graphData}
          />
        ) : showGrid && gridData ? (
          <Split position="horizontal" className="w-full h-full">
            {({ Panel: SplitPanel }) => (
              <>
                <SplitPanel key="grid" minSize={320}>
                  <GridView
                    key={gridRefreshKey}
                    gridData={gridData}
                    onImageOpen={image => {
                      setActiveImage(image);
                    }}
                    onClearPreview={() => setActiveImage(null)}
                  />
                </SplitPanel>
                {activeImage && (
                  <SplitPanel
                    key="sidebar"
                    canHidden
                    onHidden={hidden => hidden && setActiveImage(null)}
                    hiddenSize={200}
                    minSize={280}
                    initialSize={360}
                  >
                    <FileDetailSidebar
                      moaId={moaId}
                      image={activeImage}
                      onClose={() => setActiveImage(null)}
                    />
                  </SplitPanel>
                )}
              </>
            )}
          </Split>
        ) : showViewer && rootFile ? (
          <FileViewer file={rootFile} moaId={moaId} />
        ) : null}
      </div>
    </div>,
    container,
  );
};

export default memo(Panel);

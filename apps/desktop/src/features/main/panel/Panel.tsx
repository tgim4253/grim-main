import { usePanelsStore } from '@tgim/stores/index';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallow, useShallow } from 'zustand/shallow';
import ReactDOM from 'react-dom';
import { ipc } from '../../../lib/ipc';
import { useMoa } from '@tgim/hooks/useMoa';
import { dirname, join } from '@tauri-apps/api/path';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import GraphView from './panels/GraphView';
import {
  Connection,
  GraphConnection,
  GraphData,
  GraphNode,
  GraphNodeType,
  GraphResponse,
  Node,
  NodeCrop,
  NodeFile,
  NodeFolder,
  NodeKind,
  RelationType,
} from '@tgim/types/graph';
import { createNewId } from '@tgim/utils/identifier';
import GridView from './panels/grid/GridView';
import { GridData, ImageItem } from '@tgim/types/grid';
import { FileType, ThumbResSpec } from '@tgim/types/file';
import { Button } from '@tgim/ui';
import cn from '@tgim/utils/cn';
import { Split } from '@tgim/ui/Splitter';
import FileDetailSidebar from './panels/FileDetailSidebar';
import { Camera, Crop, Eye, GitBranch, LayoutGrid, NotebookPen } from 'lucide-react';
import FileViewer from './panels/FileViewer';
import { useFileDrop } from '../../../../../../packages/hooks/src/useFileDrop';
import { toast } from 'react-toastify';
import ImageCropView from './panels/ImageCropView';
import ImageMemoView, { MemoEntry as MemoViewEntry } from './panels/ImageMemoView';
import { toNormalizedCropRect } from '@tgim/utils/crop';

const DEFAULT_CAPTURE_LINK = 'relativeimage';
const FOLDER_CAPTURE_FORWARD_LINK = RelationType.ContainsFile;
const FOLDER_CAPTURE_REVERSE_LINK = RelationType.BelongToFolder;

interface PanelProps {
  panelId: string;
  hidden?: boolean;
}

type ViewType = 'graph' | 'grid' | 'viewer' | 'crop' | 'memo';

const Panel: React.FC<PanelProps> = ({ panelId, hidden }) => {
  const [viewType, setViewType] = useState<ViewType>('graph');
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [rootNodeId, setRootNodeId] = useState<string | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [rootNode, setRootNode] = useState<Node | null>(null);
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);
  const [gridRefreshKey, setGridRefreshKey] = useState(0);
  const [rawNodesById, setRawNodesById] = useState<Record<string, Node>>({});
  const [rawConnections, setRawConnections] = useState<Connection[]>([]);
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
    setRawNodesById(nodesMap);
    setRawConnections(graphData.connections);
    const connectionsMap: Record<string, Connection[]> = {};
    const incomingConnectionsMap: Record<string, Connection[]> = {};
    graphData.connections.forEach(connection => {
      if (!connectionsMap[connection.srcNodeId]) {
        connectionsMap[connection.srcNodeId] = [];
      }
      connectionsMap[connection.srcNodeId].push(connection);

      if (!incomingConnectionsMap[connection.dstNodeId]) {
        incomingConnectionsMap[connection.dstNodeId] = [];
      }
      incomingConnectionsMap[connection.dstNodeId].push(connection);
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
      } else if (node.kind === NodeKind.Crop && node.data['Crop']) {
        const crop = node.data['Crop'] as NodeCrop;
        const outgoingConnections = connectionsMap[node.id] ?? [];
        const incomingConnections = incomingConnectionsMap[node.id] ?? [];

        const originConnection =
          outgoingConnections.find(connection => connection.kind === RelationType.CroppedOrigin) ??
          incomingConnections.find(connection => connection.kind === RelationType.Cropped);

        let originHash: string | undefined;
        let originNodeId: string | undefined;
        if (originConnection) {
          originNodeId =
            originConnection.kind === RelationType.CroppedOrigin
              ? originConnection.dstNodeId
              : originConnection.srcNodeId;
          const originNode = originNodeId ? nodesMap[originNodeId] : undefined;
          const originFile = originNode?.data?.['File'];
          if (originFile?.xxh364) {
            originHash = originFile.xxh364;
          }
        }

        const normalizedCropRect = toNormalizedCropRect(crop);

        return {
          id: graphNodeId,
          nodeId: node.id,
          label: 'Crop',
          size: nodeSize,
          type: 'crop',
          crop,
          originHash: originHash ?? crop.originHash,
          originNodeId,
          cropRect: normalizedCropRect ?? undefined,
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

  const handleGraphUpdate = useCallback(
    (graph: GraphResponse) => {
      const nextGraphData = transformDataToGraphData(graph);
      setGraphData(nextGraphData);
    },
    [transformDataToGraphData],
  );
  const [defaultDownloadPath, setDefaultDownloadPath] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const moas = await ipc.moa.loadMoas();
      const target = moas.find(moa => moa.moaId === moaId);
      if (!target) return;
      const defaultPath = await join(target.path, target.name, 'download');
      setDefaultDownloadPath(defaultPath);
    })();
  }, [moaId]);
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
      handleGraphUpdate(data);
      setGridData(await transformDataToGridData(data));
      setGraphRefreshKey(prev => prev + 1);
      setGridRefreshKey(prev => prev + 1);
    } catch (e) {
      console.error('Failed to load panel data', e);
    }
  }, [handleGraphUpdate, moaId, panel.nodeId, transformDataToGridData]);

  useEffect(() => {
    void refreshPanelData();
  }, [refreshPanelData]);

  useEffect(() => {
    if (!moaId) return;

    let unlistenPromise: Promise<UnlistenFn> | null = listen(`capture://completed/${moaId}`, () => {
      void refreshPanelData();
    });

    unlistenPromise.catch(error => {
      console.error('[Panel] Failed to register capture listener', error);
    });

    return () => {
      if (!unlistenPromise) return;
      unlistenPromise
        .then(unlisten => {
          unlisten();
        })
        .catch(error => {
          console.error('[Panel] Failed to remove capture listener', error);
        });
      unlistenPromise = null;
    };
  }, [moaId, refreshPanelData]);

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
    if (!graphData || !rootNodeId) return null;

    const rootNode = graphData.nodes.find(node => node.nodeId === rootNodeId && node.depth === 0);
    if (rootNode) {
      return rootNode.id;
    }

    return graphData.nodes.find(node => node.nodeId === rootNodeId)?.id ?? null;
  }, [graphData, rootNodeId]);

  const rootFile = useMemo<NodeFile | null>(() => {
    if (!rootNode) return null;
    if (rootNode.kind === NodeKind.File) {
      return rootNode.data?.['File'] ?? null;
    }
    if (rootNode.kind === NodeKind.Crop) {
      const crop = rootNode.data?.['Crop'];
      if (!crop) return null;
      const originHash = crop.originHash;
      if (!originHash) return null;
      const originNode = Object.values(rawNodesById).find(candidate => {
        if (candidate.kind !== NodeKind.File) return false;
        const file = candidate.data?.['File'];
        return file?.xxh364 === originHash;
      });
      return originNode?.data?.['File'] ?? null;
    }
    return null;
  }, [rawNodesById, rootNode]);

  const cropEntries = useMemo(() => {
    if (!graphData) return [] as { nodeId: string; crop: NodeCrop }[];
    const unique = new Map<string, NodeCrop>();
    graphData.nodes.forEach(node => {
      if (node.type === 'crop' && node.crop) {
        unique.set(node.nodeId, node.crop);
      }
    });
    const entries = Array.from(unique.entries()).map(([nodeId, crop]) => ({ nodeId, crop }));
    if (!rootFile?.xxh364) return entries;
    return entries.filter(entry => entry.crop.originHash === rootFile.xxh364);
  }, [graphData, rootFile?.xxh364]);

  const memoEntries = useMemo<MemoViewEntry[]>(() => {
    if (!rootFile?.xxh364 || !rootNode || rootNode.kind !== NodeKind.File) {
      return [];
    }

    const entries: MemoViewEntry[] = [];
    const rootHash = rootFile.xxh364;
    const rootNodeId = rootNode.id;

    Object.values(rawNodesById).forEach(node => {
      if (node.kind !== NodeKind.Memo) return;
      const memo = node.data?.['Memo'];
      if (!memo) return;

      const attachmentConnection = rawConnections.find(
        connection => connection.kind === RelationType.Memo && connection.dstNodeId === node.id,
      );

      if (!attachmentConnection) return;

      const attachmentNode = rawNodesById[attachmentConnection.srcNodeId];
      if (!attachmentNode) return;

      if (attachmentNode.kind === NodeKind.File) {
        if (attachmentNode.id !== rootNodeId) return;
        entries.push({
          memo,
          attachmentNodeId: attachmentNode.id,
          attachmentType: 'file',
        });
      } else if (attachmentNode.kind === NodeKind.Crop) {
        const crop = attachmentNode.data?.['Crop'];
        if (!crop) return;
        if (crop.originHash !== rootHash) return;
        entries.push({
          memo,
          attachmentNodeId: attachmentNode.id,
          attachmentType: 'crop',
          crop,
        });
      }
    });

    return entries;
  }, [rawConnections, rawNodesById, rootFile?.xxh364, rootNode]);

  const availableViews = useMemo<ViewType[]>(() => {
    if (rootNode?.kind === NodeKind.Folder) {
      return ['grid', 'graph'];
    }
    if (rootNode?.kind === NodeKind.File) {
      if (rootFile?.kind === FileType.Image) {
        return ['viewer', 'crop', 'graph', 'memo'];
      }
      return ['viewer', 'graph'];
    }
    if (rootNode?.kind === NodeKind.Crop) {
      return ['viewer', 'graph'];
    }
    return ['graph'];
  }, [rootFile?.kind, rootNode?.kind]);

  const defaultView = useMemo<ViewType>(() => {
    if (rootNode?.kind === NodeKind.Crop && availableViews.includes('viewer')) {
      return 'viewer';
    }
    return availableViews[0] ?? 'graph';
  }, [availableViews, rootNode?.kind]);

  const rootFolder = useMemo(() => {
    if (!rootNode) return null;
    if (rootNode.kind !== NodeKind.Folder) return null;
    return rootNode.data['Folder'] ?? null;
  }, [rootNode]);
  useEffect(() => {
    if (!availableViews.includes(viewType)) {
      setViewType(defaultView);
    }
  }, [availableViews, defaultView, viewType]);

  const previousCropRootIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (rootNode?.kind !== NodeKind.Crop) {
      previousCropRootIdRef.current = null;
      return;
    }
    if (!rootNode.id || !availableViews.includes('viewer')) return;
    if (previousCropRootIdRef.current === rootNode.id) return;
    previousCropRootIdRef.current = rootNode.id;
    setViewType('viewer');
  }, [availableViews, rootNode]);

  const activeCrop = useMemo<NodeCrop | null>(() => {
    if (rootNode?.kind !== NodeKind.Crop) return null;
    return rootNode.data?.['Crop'] ?? null;
  }, [rootNode]);

  const captureAnchor = useMemo(() => {
    if (!rootNode) return null;

    if (rootNode.kind === NodeKind.File && rootFile?.xxh364) {
      return {
        type: 'file' as const,
        hash: rootFile.xxh364,
        nodeId: rootNode.id,
      };
    }

    if (rootNode.kind === NodeKind.Folder && rootFolder) {
      const mountWithPath = rootFolder.mounts?.find(mount => mount.realPath);
      if (mountWithPath?.realPath) {
        return {
          type: 'folder' as const,
          nodeId: rootNode.id,
          path: mountWithPath.realPath,
        };
      } else if (defaultDownloadPath) {
        return {
          type: 'folder' as const,
          nodeId: rootNode.id,
          path: defaultDownloadPath,
        };
      }
    }

    return null;
  }, [rootFile?.xxh364, rootFolder, rootNode, defaultDownloadPath]);

  const dropEnabled = useMemo(() => Boolean(rootFolder && moaId), [rootFolder, moaId]);
  const canCapture = useMemo(() => Boolean(moaId && captureAnchor), [captureAnchor, moaId]);

  const { isDropActive, handleDrop, handleDragEnter, handleDragLeave, handleDragOver } =
    useFileDrop({
      dropEnabled,
      rootNodeId,
      moaId: moaId ?? null,
      refreshPanelData,
    });

  const isRootFileImage = useMemo(() => {
    return (
      !!rootFile && rootNode?.kind !== NodeKind.Crop && rootFile.kind === FileType.Image && !!moaId
    );
  }, [rootFile, rootNode]);

  const showGraph = viewType === 'graph' && graphData && rootNodeId && rootGraphNodeId;
  const showGrid = viewType === 'grid' && !!gridData && availableViews.includes('grid');
  const showViewer = viewType === 'viewer' && !!rootFile;
  const showMemo = viewType === 'memo' && isRootFileImage;
  const showCrop = viewType === 'crop' && isRootFileImage;

  const handleStartCapture = useCallback(async () => {
    if (!moaId || !captureAnchor) return;

    setCaptureBusy(true);
    try {
      if (captureAnchor.type === 'file') {
        const filePath = await ipc.file.getFilePath(moaId, captureAnchor.hash);
        const targetDirectory = await dirname(filePath);
        await ipc.capture.openOverlay({
          moaId,
          sourceHash: captureAnchor.hash,
          sourceNodeId: captureAnchor.nodeId,
          savePath: targetDirectory,
          linkTypeForward: DEFAULT_CAPTURE_LINK,
          linkTypeReverse: DEFAULT_CAPTURE_LINK,
        });
      } else if (captureAnchor.type === 'folder') {
        if (!captureAnchor.path) {
          toast.error('폴더 경로를 확인할 수 없습니다.');
          return;
        }
        await ipc.capture.openOverlay({
          moaId,
          sourceNodeId: captureAnchor.nodeId,
          savePath: captureAnchor.path,
          linkTypeForward: FOLDER_CAPTURE_FORWARD_LINK,
          linkTypeReverse: FOLDER_CAPTURE_REVERSE_LINK,
        });
      }
    } catch (error) {
      console.error('[Panel] Failed to open capture overlay', error);
      toast.error('캡처를 시작할 수 없습니다.');
    } finally {
      setCaptureBusy(false);
    }
  }, [captureAnchor, moaId]);

  const getViewIcon = useCallback((type: ViewType) => {
    switch (type) {
      case 'grid':
        return LayoutGrid;
      case 'viewer':
        return Eye;
      case 'crop':
        return Crop;
      case 'memo':
        return NotebookPen;
      case 'graph':
      default:
        return GitBranch;
    }
  }, []);

  const captureDisabled = !canCapture || captureBusy;

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
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="icon"
            aria-label="캡처 시작"
            title="캡처 시작"
            onClick={handleStartCapture}
            disabled={captureDisabled}
            className="h-8 w-8"
          >
            <Camera className="h-4 w-4" />
          </Button>
          {availableViews.length > 1 ? (
            <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-muted p-1 shadow-inner">
              {availableViews.map(type => {
                const Icon = getViewIcon(type);
                const isActive = viewType === type;
                const labels: Record<ViewType, string> = {
                  graph: '그래프 보기',
                  grid: '그리드 보기',
                  viewer: '뷰어 보기',
                  crop: '크롭 도구',
                  memo: '메모 도구',
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
          <GridView
            key={gridRefreshKey}
            gridData={gridData}
            onImageOpen={image => {}}
            onClearPreview={() => {}}
          />
        ) : showViewer && rootFile ? (
          <FileViewer file={rootFile} moaId={moaId} crop={activeCrop ?? undefined} />
        ) : showCrop && rootFile && moaId ? (
          <ImageCropView
            file={rootFile}
            moaId={moaId!}
            crops={cropEntries}
            onRefresh={refreshPanelData}
          />
        ) : showMemo && rootFile && moaId ? (
          <ImageMemoView
            file={rootFile}
            moaId={moaId!}
            memoEntries={memoEntries}
            onRefresh={refreshPanelData}
          />
        ) : null}
      </div>
    </div>,
    container,
  );
};

export default memo(Panel);

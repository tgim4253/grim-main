import { usePanelsStore } from '@tgim/stores/index';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { shallow, useShallow } from 'zustand/shallow';
import ReactDOM from 'react-dom';
import { ipc } from '../../../lib/ipc';
import { useMoa } from '@tgim/hooks/useMoa';
import { dirname } from '@tauri-apps/api/path';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import GraphView from './panels/graph/GraphView';
import {
  GraphData,
  GraphResponse,
  Node,
  NodeFile,
  NodeFolder,
  NodeKind,
  RelationType,
} from '@tgim/types/graph';
import { GraphOption, GraphPreferences } from '@tgim/types/graph-settings';
import { PanelPreferences, PanelView } from '@tgim/types/panel-settings';
import GridView from './panels/GridView';
import { GridData, ImageItem } from '@tgim/types/grid';
import { FileType, ThumbResSpec } from '@tgim/types/file';
import { Button } from '@tgim/ui';
import cn from '@tgim/utils/cn';
import { Split } from '@tgim/ui/Splitter';
import FileDetailSidebar from './panels/FileDetailSidebar';
import { Camera, Eye, GitBranch, LayoutGrid } from 'lucide-react';
import FileViewer from './panels/FileViewer';
import { usePanelDrop } from './usePanelDrop';
import { toast } from 'react-toastify';
import { normaliseGraphPreferences, normaliseGraphOption } from './lib/graphPreferences';
import {
  createDefaultPanelPreferences,
  normalisePanelPreferences,
} from './lib/panelPreferences';
import { GraphContext } from './types';
import { buildGraphData, buildGridData } from './lib/graphData';

const DEFAULT_CAPTURE_LINK = 'relativeimage';
const FOLDER_CAPTURE_FORWARD_LINK = RelationType.ContainsFile;
const FOLDER_CAPTURE_REVERSE_LINK = RelationType.BelongToFolder;

interface PanelProps {
  panelId: string;
  hidden?: boolean;
}

type ViewType = PanelView;

const Panel: React.FC<PanelProps> = ({ panelId, hidden }) => {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [rootNodeId, setRootNodeId] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<ImageItem | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [rootNode, setRootNode] = useState<Node | null>(null);
  const [graphRefreshKey, setGraphRefreshKey] = useState(0);
  const [gridRefreshKey, setGridRefreshKey] = useState(0);
  const [graphContext, setGraphContext] = useState<GraphContext | null>(null);
  const [panelPreferences, setPanelPreferences] = useState<PanelPreferences>(() =>
    createDefaultPanelPreferences(),
  );
  const [panelSettingsLoaded, setPanelSettingsLoaded] = useState(false);
  const graphPreferences = useMemo(
    () => panelPreferences.graph,
    [panelPreferences.graph],
  );
  const activeGraphOption = useMemo(() => {
    const active =
      graphPreferences.presets.find(preset => preset.id === graphPreferences.activePresetId) ??
      graphPreferences.presets[0];
    return normaliseGraphOption(active?.option);
  }, [graphPreferences]);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { panel, containerId, isActive } = usePanelsStore(
    useShallow(state => ({
      panel: state.panelEntities[panelId],
      containerId: state.panelOwnership[panelId],
      isActive: state.activePanelId === panelId,
    })),
  );
  const panelNodeId = panel?.nodeId;
  const { moaId } = useMoa(location);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!moaId) return;

    let isCancelled = false;

    const loadPreferences = async () => {
      setPanelSettingsLoaded(false);
      try {
        const response = await ipc.panel.loadPreferences(moaId);
        if (isCancelled) return;
        const preferences = normalisePanelPreferences(response);
        setPanelPreferences(preferences);
      } catch (error) {
        console.error('[Panel] Failed to load panel preferences', error);
        if (isCancelled) return;
        setPanelPreferences(createDefaultPanelPreferences());
      } finally {
        if (!isCancelled) {
          setPanelSettingsLoaded(true);
        }
      }
    };

    void loadPreferences();

    return () => {
      isCancelled = true;
    };
  }, [moaId]);

  const updatePanelPreferences = useCallback(
    (updater: (prev: PanelPreferences) => PanelPreferences) => {
      setPanelPreferences(prev => {
        const base = normalisePanelPreferences(prev);
        const next = normalisePanelPreferences(updater(base));
        return next;
      });
    },
    [],
  );

  const viewType = useMemo<ViewType>(
    () => panelPreferences.activeView ?? 'graph',
    [panelPreferences.activeView],
  );

  const setActiveView = useCallback(
    (view: ViewType) => {
      updatePanelPreferences(prev => ({ ...prev, activeView: view }));
    },
    [updatePanelPreferences],
  );

  const applyGraphResponse = useCallback((data: GraphResponse) => {
    setRootNodeId(data.rootNodeId);
    setRootNode(data.nodes.find(node => node.id === data.rootNodeId) ?? null);

    const { graph, context } = buildGraphData(data);
    setGraphData(graph);
    setGraphContext(context);
    setGridData(buildGridData(data));
    updatePanelPreferences(prev => ({ ...prev, rootNodeId: data.rootNodeId }));
  }, [updatePanelPreferences]);
  useEffect(() => {
    if (containerId) {
      const el = document.getElementById(containerId);

      if (el) setContainer(el);
    }
  }, [containerId]);
  const handleGraphPreferencesUpdate = useCallback(
    (updater: (prev: GraphPreferences) => GraphPreferences) => {
      updatePanelPreferences(prev => ({
        ...prev,
        graph: normaliseGraphPreferences(updater(prev.graph)),
      }));
    },
    [updatePanelPreferences],
  );
  const handleGraphOptionChange = useCallback(
    (updater: (prev: GraphOption) => GraphOption) => {
      updatePanelPreferences(prev => {
        const base = normaliseGraphPreferences(prev.graph);
        const index = base.presets.findIndex(preset => preset.id === base.activePresetId);
        if (index === -1) {
          return prev;
        }

        const nextOption = normaliseGraphOption(updater(base.presets[index].option));
        const nextPresets = [...base.presets];
        nextPresets[index] = { ...nextPresets[index], option: nextOption };
        return { ...prev, graph: { ...base, presets: nextPresets } };
      });
    },
    [updatePanelPreferences],
  );
  const handleSavePanelPreferences = useCallback(async () => {
    if (!moaId) return;
    try {
      await ipc.panel.savePreferences(moaId, panelPreferences);
      toast.success('그래프 설정을 저장했어요.');
    } catch (error) {
      console.error('[Panel] Failed to save panel preferences', error);
      toast.error('그래프 설정을 저장하지 못했습니다.');
    }
  }, [moaId, panelPreferences]);
  const refreshPanelData = useCallback(async () => {
    if (!moaId || !panelNodeId) return;
    try {
      const data = await ipc.graph.getGraphOne(moaId, panelNodeId.toString());
      applyGraphResponse(data);
      setGraphRefreshKey(prev => prev + 1);
      setGridRefreshKey(prev => prev + 1);
    } catch (e) {
      console.error('Failed to load panel data', e);
    }
  }, [applyGraphResponse, moaId, panelNodeId]);

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
    if (!moaId || !panelNodeId) return;

    let isCancelled = false;

    const load = async () => {
      try {
        const data = await ipc.graph.getGraphOne(moaId, panelNodeId.toString());

        if (isCancelled) return;

        applyGraphResponse(data);
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
  }, [applyGraphResponse, moaId, panelNodeId]);

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

  const rootFolder = useMemo(() => {
    if (!rootNode) return null;
    if (rootNode.kind !== NodeKind.Folder) return null;
    return rootNode.data['Folder'] ?? null;
  }, [rootNode]);
  useEffect(() => {
    if (!availableViews.includes(viewType)) {
      setActiveView(defaultView);
    }
  }, [availableViews, defaultView, setActiveView, viewType]);

  const rootFile = useMemo<NodeFile | null>(() => {
    if (rootNode?.kind !== NodeKind.File) return null;
    return rootNode.data?.['File'] ?? null;
  }, [rootNode]);

  const captureAnchor = useMemo(() => {
    if (!rootNode) return null;

    if (activeImage?.hash && activeImage.nodeId) {
      return {
        type: 'file' as const,
        hash: activeImage.hash,
        nodeId: activeImage.nodeId,
      };
    }

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
  }, [
    activeImage?.hash,
    activeImage?.nodeId,
    rootFile?.xxh364,
    rootFolder,
    rootNode,
    defaultDownloadPath,
  ]);

  const dropEnabled = useMemo(() => Boolean(rootFolder && moaId), [rootFolder, moaId]);
  const canCapture = useMemo(() => Boolean(moaId && captureAnchor), [captureAnchor, moaId]);

  const { isDropActive, handleDrop, handleDragEnter, handleDragLeave, handleDragOver } =
    usePanelDrop({
      dropEnabled,
      rootNodeId,
      moaId: moaId ?? null,
      refreshPanelData,
    });

  const showGraph =
    viewType === 'graph' && graphData && rootNodeId && rootGraphNodeId && graphContext;
  const showGrid = viewType === 'grid' && !!gridData && availableViews.includes('grid');
  const showViewer = viewType === 'viewer' && !!rootFile;

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
                    onClick={() => setActiveView(type)}
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
            graphContext={graphContext}
            graphPreferences={graphPreferences}
            graphOption={activeGraphOption}
            onGraphOptionChange={handleGraphOptionChange}
            onPreferencesChange={handleGraphPreferencesUpdate}
            onSavePreferences={handleSavePanelPreferences}
            settingsLoaded={panelSettingsLoaded}
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

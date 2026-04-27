import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { formatBytes } from '../../lib/format';
import { cx } from '../../shared/lib/cx';
import { ipc } from '../../shared/lib/ipc';
import type {
  AssetListSource,
  ExplorerSnapshot,
  ImportPreviewResult,
  ImportResult,
  VirtualFolder,
} from '../../shared/types';
import {
  ALL_ASSETS_NODE_ID,
  DEFAULT_ASSET_SOURCE,
  ExplorerPanel,
  buildExplorerNodes,
  type ExplorerCreateFolderRequest,
  type ExplorerNode,
} from '../../features/library-explorer';
import { ReferencesView } from '../../features/library-workspace';
import {
  FolderSearchModal,
  ImportAssetsModal,
  ImportCompletedModal,
  type ImportSummary,
} from '../../features/library-workspace/import';
import { AppTopBar } from '../../ui/Header/AppTopBar';
import {
  MiniSidebarRail,
  type PrimaryRailAction,
  type PrimaryRailItem,
} from '../../ui/Sidebar/MiniSidebarRail';
import { SidebarPanel } from '../../ui/Sidebar/SidebarPanel';
import './library-page.css';

const SIDEBAR_COLLAPSED_WIDTH = 48;
const SIDEBAR_DEFAULT_WIDTH = 343;
const SIDEBAR_MIN_WIDTH = 240;
const SIDEBAR_RESIZE_STEP = 24;
const MAIN_CONTAINER_MIN_WIDTH = 320;
const SUPPORTED_IMPORT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'];
const NO_DESTINATION_FOLDERS_ERROR = 'No destination folders are available for import.';

type ImportStep = 'folder' | 'assets' | 'completed';

type ImportProgressState = {
  completed: number;
  total: number;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return fallback;
}

function getSidebarMaxWidth() {
  if (typeof window === 'undefined') {
    return SIDEBAR_DEFAULT_WIDTH;
  }

  return Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth - MAIN_CONTAINER_MIN_WIDTH);
}

function clampSidebarWidth(width: number) {
  return Math.min(Math.max(width, SIDEBAR_MIN_WIDTH), getSidebarMaxWidth());
}

function getSourceFolderId(source: AssetListSource) {
  return source.kind === 'folder' ? source.folderId : null;
}

function normalizeSelectedFilePaths(filePaths: readonly string[]) {
  return [...new Set(filePaths.map(filePath => filePath.trim()).filter(Boolean))];
}

function normalizeDialogSelection(selection: string | string[] | null) {
  if (!selection) {
    return [];
  }

  return Array.isArray(selection) ? selection : [selection];
}

function createImportSummary(
  result: ImportResult,
  destinationFolder: VirtualFolder,
): ImportSummary {
  const totalSize = result.assets.reduce((sum, asset) => sum + asset.fileSize, 0);

  return {
    importedCount: result.imported,
    reusedCount: result.reused,
    processedCount: result.imported + result.reused,
    failedCount: result.failed.length,
    totalSize: formatBytes(totalSize),
    destinationFolder: destinationFolder.fullPath || destinationFolder.name,
  };
}

function formatPreviewFailureMessage(failedCount: number) {
  if (failedCount === 0) {
    return null;
  }

  const itemLabel = failedCount === 1 ? 'item' : 'items';
  return `${failedCount.toLocaleString()} ${itemLabel} could not be reviewed and will be skipped.`;
}

export function LibraryPage() {
  const [isSidebarPanelOpen, setIsSidebarPanelOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [explorerSnapshot, setExplorerSnapshot] = useState<ExplorerSnapshot | null>(null);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [isExplorerLoading, setIsExplorerLoading] = useState(true);
  const [activeExplorerNodeId, setActiveExplorerNodeId] = useState(ALL_ASSETS_NODE_ID);
  const [assetSource, setAssetSource] = useState<AssetListSource>(DEFAULT_ASSET_SOURCE);
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = useState(0);
  const [importStep, setImportStep] = useState<ImportStep | null>(null);
  const [importFolderId, setImportFolderId] = useState<string | undefined>();
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | undefined>();
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | undefined>();
  const [importProgress, setImportProgress] = useState<ImportProgressState | undefined>();
  const [isImporting, setIsImporting] = useState(false);
  const [isImportPreviewing, setIsImportPreviewing] = useState(false);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [isImportDragActive, setIsImportDragActive] = useState(false);
  const importInFlightRef = useRef(false);
  const importPreviewInFlightRef = useRef(false);
  const filePickerOpenRef = useRef(false);
  const resizeSessionRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(
    null,
  );
  const explorerNodes = useMemo(() => buildExplorerNodes(explorerSnapshot), [explorerSnapshot]);
  const assignableFolderIds = useMemo(() => {
    const nextIds = new Set<string>();

    for (const stats of explorerSnapshot?.folderStats ?? []) {
      if (stats.childCount === 0) {
        nextIds.add(stats.folderId);
      }
    }

    return nextIds;
  }, [explorerSnapshot]);
  const assignableFolders = useMemo(
    () =>
      (explorerSnapshot?.virtualFolders ?? []).filter(folder => assignableFolderIds.has(folder.id)),
    [assignableFolderIds, explorerSnapshot],
  );
  const assignableFolderById = useMemo(
    () => new Map(assignableFolders.map(folder => [folder.id, folder])),
    [assignableFolders],
  );

  const loadExplorerSnapshot = useCallback(async () => {
    setIsExplorerLoading(true);
    setExplorerError(null);

    try {
      const snapshot = await ipc.library.loadExplorerSnapshot();
      setExplorerSnapshot(snapshot);
    } catch (error) {
      setExplorerError(getErrorMessage(error, 'Failed to load explorer.'));
    } finally {
      setIsExplorerLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadExplorerSnapshot();
  }, [loadExplorerSnapshot]);

  const primaryItems: readonly PrimaryRailItem[] = [
    {
      icon: 'folder-open',
      label: 'Library',
      action: 'toggle-sidebar-panel',
      active: isSidebarPanelOpen,
    },
    {
      icon: 'search',
      label: 'Search',
      action: 'open-search',
    },
    {
      icon: 'grid',
      label: 'Grid',
      action: 'open-grid',
    },
    {
      icon: 'star',
      label: 'Favorites',
      action: 'open-favorites',
    },
  ];

  const handlePrimaryAction = (action: PrimaryRailAction) => {
    if (action === 'toggle-sidebar-panel') {
      setIsSidebarPanelOpen(open => !open);
    }
  };

  const handleExplorerNodeSelect = useCallback((node: ExplorerNode) => {
    if (!node.source) {
      return;
    }

    setActiveExplorerNodeId(node.id);
    setAssetSource(node.source);
  }, []);

  const handleCreateExplorerFolder = useCallback(
    async ({ parentId, name }: ExplorerCreateFolderRequest) => {
      await ipc.folder.save({ name, parentId });
      await loadExplorerSnapshot();
    },
    [loadExplorerSnapshot],
  );

  const getDefaultImportFolderId = useCallback(() => {
    const activeFolderId = getSourceFolderId(assetSource);

    if (activeFolderId && assignableFolderById.has(activeFolderId)) {
      return activeFolderId;
    }

    return undefined;
  }, [assetSource, assignableFolderById]);

  const handleOpenImport = useCallback(() => {
    if (isExplorerLoading) {
      return;
    }

    setImportFolderId(getDefaultImportFolderId());
    setImportSummary(undefined);
    setImportPreview(undefined);
    setImportProgress(undefined);
    setImportError(assignableFolders.length > 0 ? null : NO_DESTINATION_FOLDERS_ERROR);
    setImportStep('folder');
    setIsImportDragActive(false);
  }, [assignableFolders.length, getDefaultImportFolderId, isExplorerLoading]);

  const handleCloseImport = useCallback(() => {
    if (
      importInFlightRef.current ||
      importPreviewInFlightRef.current ||
      filePickerOpenRef.current
    ) {
      return;
    }

    setImportStep(null);
    setImportFolderId(undefined);
    setImportError(null);
    setImportSummary(undefined);
    setImportPreview(undefined);
    setImportProgress(undefined);
    setIsImportDragActive(false);
  }, []);

  useEffect(() => {
    if (
      importStep !== 'folder' ||
      importError !== NO_DESTINATION_FOLDERS_ERROR ||
      assignableFolders.length === 0
    ) {
      return;
    }

    setImportError(null);
  }, [assignableFolders.length, importError, importStep]);

  const handleImportFolderChange = useCallback((folderId: string) => {
    setImportFolderId(folderId);
    setImportError(null);
  }, []);

  const handleSelectImportFolder = useCallback(() => {
    if (!importFolderId || !assignableFolderById.has(importFolderId)) {
      setImportError('Select a destination folder before choosing files.');
      return;
    }

    setImportError(null);
    setImportStep('assets');
  }, [assignableFolderById, importFolderId]);

  const previewImportFilePaths = useCallback(
    async (filePaths: readonly string[]) => {
      if (importInFlightRef.current || importPreviewInFlightRef.current) {
        return;
      }

      if (!importFolderId) {
        setImportError('Select a destination folder before choosing files.');
        setImportStep('folder');
        return;
      }

      const destinationFolder = assignableFolderById.get(importFolderId);
      if (!destinationFolder) {
        setImportError('The selected destination folder cannot receive imported assets.');
        setImportStep('folder');
        return;
      }

      const selectedPaths = normalizeSelectedFilePaths(filePaths);
      if (selectedPaths.length === 0) {
        setImportError('Select at least one image file or folder.');
        setImportPreview(undefined);
        setImportProgress(undefined);
        setImportStep('assets');
        return;
      }

      importPreviewInFlightRef.current = true;
      setIsImportPreviewing(true);
      setImportError(null);
      setImportSummary(undefined);
      setImportProgress(undefined);

      try {
        const preview = await ipc.import.previewImages({
          filePaths: selectedPaths,
          virtualFolderIds: [importFolderId],
        });
        const previewFailureMessage = formatPreviewFailureMessage(preview.failed.length);
        if (preview.assetCount === 0 || preview.filePaths.length === 0) {
          setImportError(
            previewFailureMessage
              ? `No supported image files were found. ${previewFailureMessage}`
              : 'No supported image files were found.',
          );
          setImportPreview(undefined);
          setImportStep('assets');
          return;
        }

        setImportPreview(preview);
        setImportError(previewFailureMessage);
        setImportStep('assets');
      } catch (error) {
        setImportPreview(undefined);
        setImportError(getErrorMessage(error, 'Failed to review selected files.'));
        setImportStep('assets');
      } finally {
        importPreviewInFlightRef.current = false;
        setIsImportPreviewing(false);
        setIsImportDragActive(false);
      }
    },
    [assignableFolderById, importFolderId],
  );

  const handleImportPreviewedFiles = useCallback(() => {
    if (importInFlightRef.current || importPreviewInFlightRef.current) {
      return;
    }

    if (!importFolderId) {
      setImportError('Select a destination folder before importing files.');
      setImportStep('folder');
      return;
    }

    const destinationFolder = assignableFolderById.get(importFolderId);
    if (!destinationFolder) {
      setImportError('The selected destination folder cannot receive imported assets.');
      setImportStep('folder');
      return;
    }

    const filePaths = importPreview?.filePaths ?? [];
    if (filePaths.length === 0) {
      setImportError('Select image files before importing.');
      return;
    }

    importInFlightRef.current = true;
    setIsImporting(true);
    setImportError(null);
    setImportProgress({ completed: 0, total: filePaths.length });

    void (async () => {
      const aggregateResult: ImportResult = {
        imported: 0,
        reused: 0,
        failed: [...(importPreview?.failed ?? [])],
        assets: [],
      };

      try {
        for (let index = 0; index < filePaths.length; index += 1) {
          const filePath = filePaths[index];

          try {
            const result = await ipc.import.importImages({
              filePaths: [filePath],
              virtualFolderIds: [importFolderId],
            });

            aggregateResult.imported += result.imported;
            aggregateResult.reused += result.reused;
            aggregateResult.failed.push(...result.failed);
            aggregateResult.assets.push(...result.assets);
          } catch (error) {
            aggregateResult.failed.push({
              filePath,
              error: getErrorMessage(error, 'Failed to import file.'),
            });
          } finally {
            setImportProgress({ completed: index + 1, total: filePaths.length });
          }
        }

        const processedCount = aggregateResult.imported + aggregateResult.reused;
        if (processedCount === 0 && aggregateResult.failed.length === 0) {
          setImportError('No supported images were imported.');
          setImportProgress(undefined);
          setImportStep('assets');
          return;
        }

        setImportSummary(createImportSummary(aggregateResult, destinationFolder));
        setImportPreview(undefined);
        setImportProgress(undefined);
        setImportStep('completed');
        setWorkspaceRefreshKey(current => current + 1);
        void loadExplorerSnapshot();
      } catch (error) {
        setImportError(getErrorMessage(error, 'Failed to import assets.'));
        setImportProgress(undefined);
        setImportStep('assets');
      } finally {
        importInFlightRef.current = false;
        setIsImporting(false);
        setIsImportDragActive(false);
      }
    })();
  }, [assignableFolderById, importFolderId, importPreview, loadExplorerSnapshot]);

  const handleSelectImportFiles = useCallback(() => {
    if (importInFlightRef.current || filePickerOpenRef.current) {
      return;
    }

    filePickerOpenRef.current = true;
    setIsFilePickerOpen(true);

    void (async () => {
      try {
        const selection = await open({
          multiple: true,
          directory: false,
          filters: [
            {
              name: 'Supported Images',
              extensions: SUPPORTED_IMPORT_EXTENSIONS,
            },
          ],
        });
        const selectedFilePaths = normalizeDialogSelection(selection);
        if (selectedFilePaths.length === 0) {
          return;
        }

        await previewImportFilePaths(selectedFilePaths);
      } catch (error) {
        setImportError(getErrorMessage(error, 'Failed to open file picker.'));
      } finally {
        filePickerOpenRef.current = false;
        setIsFilePickerOpen(false);
      }
    })();
  }, [previewImportFilePaths]);

  const handleSelectImportFolders = useCallback(() => {
    if (importInFlightRef.current || filePickerOpenRef.current) {
      return;
    }

    filePickerOpenRef.current = true;
    setIsFilePickerOpen(true);

    void (async () => {
      try {
        const selection = await open({
          multiple: true,
          directory: true,
          recursive: true,
        });
        const selectedFolderPaths = normalizeDialogSelection(selection);
        if (selectedFolderPaths.length === 0) {
          return;
        }

        await previewImportFilePaths(selectedFolderPaths);
      } catch (error) {
        setImportError(getErrorMessage(error, 'Failed to open folder picker.'));
      } finally {
        filePickerOpenRef.current = false;
        setIsFilePickerOpen(false);
      }
    })();
  }, [previewImportFilePaths]);

  useEffect(() => {
    if (importStep !== 'assets' || isImporting || isImportPreviewing || isFilePickerOpen) {
      setIsImportDragActive(false);
      return undefined;
    }

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWebview()
      .onDragDropEvent(event => {
        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          setIsImportDragActive(true);
          return;
        }

        if (event.payload.type === 'leave') {
          setIsImportDragActive(false);
          return;
        }

        setIsImportDragActive(false);
        void previewImportFilePaths(event.payload.paths);
      })
      .then(nextUnlisten => {
        if (cancelled) {
          nextUnlisten();
          return;
        }

        unlisten = nextUnlisten;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setImportError(getErrorMessage(error, 'Failed to listen for dropped files.'));
        }
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [importStep, isFilePickerOpen, isImportPreviewing, isImporting, previewImportFilePaths]);

  const handleSplitterPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isSidebarPanelOpen) {
        return;
      }

      resizeSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: sidebarWidth,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsResizingSidebar(true);
      event.preventDefault();
    },
    [isSidebarPanelOpen, sidebarWidth],
  );

  const handleSplitterPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    const nextWidth = clampSidebarWidth(session.startWidth + (event.clientX - session.startX));
    setSidebarWidth(nextWidth);
    event.preventDefault();
  }, []);

  const handleSplitterPointerEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resizeSessionRef.current = null;
    setIsResizingSidebar(false);
  }, []);

  const handleSplitterKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isSidebarPanelOpen) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setSidebarWidth(current => clampSidebarWidth(current - SIDEBAR_RESIZE_STEP));
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setSidebarWidth(current => clampSidebarWidth(current + SIDEBAR_RESIZE_STEP));
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        setSidebarWidth(SIDEBAR_MIN_WIDTH);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        setSidebarWidth(getSidebarMaxWidth());
      }
    },
    [isSidebarPanelOpen],
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !isSidebarPanelOpen) {
      return;
    }

    const handleResize = () => {
      setSidebarWidth(current => clampSidebarWidth(current));
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isSidebarPanelOpen]);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizingSidebar]);

  const resolvedSidebarWidth = isSidebarPanelOpen
    ? clampSidebarWidth(sidebarWidth)
    : SIDEBAR_COLLAPSED_WIDTH;
  const sidebarMaxWidth = getSidebarMaxWidth();
  const sidebarStyle = {
    width: `${String(resolvedSidebarWidth)}px`,
    minWidth: `${String(resolvedSidebarWidth)}px`,
  };
  const importBusy = isImporting || isImportPreviewing;
  const importFilePreview = importPreview
    ? {
        assetCount: importPreview.assetCount,
        totalSize: formatBytes(importPreview.totalSize),
      }
    : undefined;

  return (
    <div className="app-shell library-page">
      <AppTopBar />

      <div className="app-horizontal library-page__layout">
        <div
          className={cx(
            'app-sidebar',
            'library-page__sidebar',
            !isSidebarPanelOpen && 'library-page__sidebar--collapsed',
          )}
          style={sidebarStyle}
        >
          <SidebarPanel
            rail={
              <MiniSidebarRail primaryItems={primaryItems} onPrimaryAction={handlePrimaryAction} />
            }
            title="Explorer"
            collapsed={!isSidebarPanelOpen}
          >
            <ExplorerPanel
              nodes={explorerNodes}
              activeNodeId={activeExplorerNodeId}
              loading={isExplorerLoading}
              error={explorerError}
              importDisabled={isExplorerLoading}
              createFolderDisabled={isExplorerLoading}
              onNodeSelect={handleExplorerNodeSelect}
              onImport={handleOpenImport}
              onCreateFolder={handleCreateExplorerFolder}
              onRetry={() => void loadExplorerSnapshot()}
            />
          </SidebarPanel>
        </div>

        {isSidebarPanelOpen ? (
          <div
            role="separator"
            tabIndex={0}
            aria-label="Resize sidebar panel"
            aria-orientation="vertical"
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={sidebarMaxWidth}
            aria-valuenow={Math.round(resolvedSidebarWidth)}
            className="library-page__splitter"
            data-dragging={isResizingSidebar ? 'true' : undefined}
            onPointerDown={handleSplitterPointerDown}
            onPointerMove={handleSplitterPointerMove}
            onPointerUp={handleSplitterPointerEnd}
            onPointerCancel={handleSplitterPointerEnd}
            onKeyDown={handleSplitterKeyDown}
          />
        ) : null}

        <main className="app-workspace library-page__workspace library-page__main-container">
          <ReferencesView source={assetSource} refreshKey={workspaceRefreshKey} />
        </main>
      </div>

      <FolderSearchModal
        open={importStep === 'folder'}
        folders={assignableFolders}
        folderId={importFolderId}
        onFolderChange={handleImportFolderChange}
        onClose={handleCloseImport}
        busy={isImporting}
        errorMessage={importError}
        onSelectFolder={handleSelectImportFolder}
        selectFolderDisabled={!importFolderId || !assignableFolderById.has(importFolderId)}
        folderDisabled={assignableFolders.length === 0}
      />
      <ImportAssetsModal
        open={importStep === 'assets'}
        folders={assignableFolders}
        folderId={importFolderId}
        onFolderChange={handleImportFolderChange}
        onClose={handleCloseImport}
        busy={importBusy}
        errorMessage={importError}
        onSelectFiles={handleSelectImportFiles}
        onSelectFolders={handleSelectImportFolders}
        onImport={handleImportPreviewedFiles}
        filePreview={importFilePreview}
        progress={importProgress}
        busyLabel={isImporting ? 'Importing assets...' : 'Reviewing files...'}
        selectFilesDisabled={
          isFilePickerOpen ||
          isImportPreviewing ||
          isImporting ||
          !importFolderId ||
          !assignableFolderById.has(importFolderId)
        }
        selectFoldersDisabled={
          isFilePickerOpen ||
          isImportPreviewing ||
          isImporting ||
          !importFolderId ||
          !assignableFolderById.has(importFolderId)
        }
        importDisabled={
          !importPreview || !importFolderId || !assignableFolderById.has(importFolderId)
        }
        dragActive={isImportDragActive}
      />
      <ImportCompletedModal
        open={importStep === 'completed'}
        summary={importSummary}
        folders={assignableFolders}
        folderId={importFolderId}
        onFolderChange={handleImportFolderChange}
        onClose={handleCloseImport}
        onDone={handleCloseImport}
        errorMessage={importError}
        folderDisabled
      />
    </div>
  );
}

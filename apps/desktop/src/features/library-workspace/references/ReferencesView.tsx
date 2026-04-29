import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CroquisStartModal } from '../../croquis/ui/CroquisStartModal';
import { ipc } from '../../../shared/lib/ipc';
import type {
  AssetDetail,
  AssetListSource,
  AssetSummary,
  BatchUpdateAssetFoldersMode,
  CroquisRecordDetail,
  CroquisRecordSummary,
  ExplorerSnapshot,
  LibrarySettings,
  SessionPreset,
  VirtualFolder,
} from '../../../shared/types';
import { Button } from '../../../shared/ui';
import { LibraryWorkspace } from '../common/LibraryWorkspace';
import type { LibraryWorkspaceLayout } from '../common/types';
import { FolderSearchModal } from '../import';
import { AssetPreviewPanel } from './AssetPreviewPanel';
import { createReferenceAsset } from './referenceAssets';
import { ReferenceExplorerHeader } from './ReferenceExplorerHeader';
import { ReferenceMasonryTile } from './ReferenceMasonryTile';
import { ReferenceSelectionToolbar } from './ReferenceSelectionToolbar';
import './reference-workspace.css';

type ReferencesViewProps = {
  source: AssetListSource;
  refreshKey?: number;
  onExplorerRefresh?: () => Promise<void> | void;
};

type ReferenceGridStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

type FolderAction = {
  assetIds: string[];
  mode: BatchUpdateAssetFoldersMode;
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

function getSelectableFolders(snapshot: ExplorerSnapshot) {
  const statsByFolderId = new Map(snapshot.folderStats.map(stats => [stats.folderId, stats]));

  return snapshot.virtualFolders.filter(folder => {
    const stats = statsByFolderId.get(folder.id);
    return folder.kind === 'user' && (stats?.childCount ?? 0) === 0;
  });
}

function createRelatedRecordDetailMap(
  records: readonly CroquisRecordSummary[],
  results: readonly PromiseSettledResult<CroquisRecordDetail>[],
) {
  const detailsById = new Map<string, CroquisRecordDetail>();

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      detailsById.set(records[index].id, result.value);
    }
  });

  return detailsById;
}

function ReferenceGridState({ title, description, action }: ReferenceGridStateProps) {
  return (
    <div className="masonry-grid__empty">
      <div className="reference-grid-state">
        <p className="reference-grid-state__title">{title}</p>
        {description ? <p className="reference-grid-state__description">{description}</p> : null}
        {action ? <div className="reference-grid-state__action">{action}</div> : null}
      </div>
    </div>
  );
}

export function ReferencesView({ source, refreshKey = 0, onExplorerRefresh }: ReferencesViewProps) {
  const [layout, setLayout] = useState<LibraryWorkspaceLayout>('masonry');
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedAssetDetail, setSelectedAssetDetail] = useState<AssetDetail | null>(null);
  const [relatedRecordDetailsById, setRelatedRecordDetailsById] = useState(
    () => new Map<string, CroquisRecordDetail>(),
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [croquisModalOpen, setCroquisModalOpen] = useState(false);
  const [croquisAssetIds, setCroquisAssetIds] = useState<string[]>([]);
  const [sessionPresets, setSessionPresets] = useState<SessionPreset[]>([]);
  const [librarySettings, setLibrarySettings] = useState<LibrarySettings>({});
  const [isCroquisConfigLoading, setIsCroquisConfigLoading] = useState(false);
  const [croquisConfigError, setCroquisConfigError] = useState<string | null>(null);
  const [folderAction, setFolderAction] = useState<FolderAction | null>(null);
  const [folderActionFolders, setFolderActionFolders] = useState<VirtualFolder[]>([]);
  const [folderActionFolderId, setFolderActionFolderId] = useState('');
  const [folderActionBusy, setFolderActionBusy] = useState(false);
  const [folderActionLoading, setFolderActionLoading] = useState(false);
  const [folderActionError, setFolderActionError] = useState<string | null>(null);
  const [assetActionBusy, setAssetActionBusy] = useState(false);
  const [assetActionError, setAssetActionError] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);
  const selectedAssetDetailLoadSequenceRef = useRef(0);
  const croquisConfigLoadSequenceRef = useRef(0);
  const folderActionLoadSequenceRef = useRef(0);

  const loadAssets = useCallback(async () => {
    const loadSequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = loadSequence;
    setIsLoading(true);
    setError(null);

    try {
      const nextAssets = await ipc.asset.list(source);
      if (loadSequenceRef.current !== loadSequence) {
        return;
      }

      setAssets(nextAssets);
      setSelectedAssetId(current => {
        if (current && nextAssets.some(asset => asset.id === current)) {
          return current;
        }

        return null;
      });
    } catch (nextError) {
      if (loadSequenceRef.current !== loadSequence) {
        return;
      }

      setAssets([]);
      setSelectedAssetId(null);
      setPreviewOpen(false);
      setError(getErrorMessage(nextError, 'Failed to load assets.'));
    } finally {
      if (loadSequenceRef.current === loadSequence) {
        setIsLoading(false);
      }
    }
  }, [source]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets, refreshKey]);

  useEffect(() => {
    const assetIds = new Set(assets.map(asset => asset.id));
    setSelectedAssetIds(current => current.filter(assetId => assetIds.has(assetId)));
  }, [assets]);

  useEffect(() => {
    const detailLoadSequence = selectedAssetDetailLoadSequenceRef.current + 1;
    selectedAssetDetailLoadSequenceRef.current = detailLoadSequence;
    const isCurrentDetailLoad = () =>
      selectedAssetDetailLoadSequenceRef.current === detailLoadSequence;

    if (!selectedAssetId) {
      setSelectedAssetDetail(null);
      setRelatedRecordDetailsById(new Map());
      setPreviewOpen(false);
      return;
    }

    const loadDetail = async () => {
      try {
        const detail = await ipc.asset.getDetail(selectedAssetId);
        if (!isCurrentDetailLoad()) {
          return;
        }

        setSelectedAssetDetail(detail);
        setRelatedRecordDetailsById(new Map());

        const detailResults = await Promise.allSettled(
          detail.relatedRecords.map(record => ipc.record.getDetail(record.id)),
        );

        if (!isCurrentDetailLoad()) {
          return;
        }

        setRelatedRecordDetailsById(
          createRelatedRecordDetailMap(detail.relatedRecords, detailResults),
        );
      } catch {
        if (isCurrentDetailLoad()) {
          setSelectedAssetDetail(null);
          setRelatedRecordDetailsById(new Map());
        }
      }
    };

    void loadDetail();

    return () => {
      selectedAssetDetailLoadSequenceRef.current += 1;
    };
  }, [selectedAssetId]);

  const items = useMemo(
    () =>
      assets.map(asset =>
        createReferenceAsset(
          asset,
          selectedAssetDetail?.id === asset.id ? selectedAssetDetail : undefined,
          selectedAssetDetail?.id === asset.id ? relatedRecordDetailsById : undefined,
        ),
      ),
    [assets, relatedRecordDetailsById, selectedAssetDetail],
  );

  const gridEmptyState = isLoading ? (
    <ReferenceGridState title="Loading assets..." />
  ) : error ? (
    <ReferenceGridState
      title="Failed to load assets"
      description={error}
      action={
        <Button size="sm" onClick={() => void loadAssets()}>
          Retry
        </Button>
      }
    />
  ) : (
    <ReferenceGridState title="No assets in this view" />
  );

  const handleSelectedAssetChange = (assetId: string) => {
    if (selectionMode) {
      setSelectedAssetIds(current => {
        if (current.includes(assetId)) {
          return current.filter(selectedAssetId => selectedAssetId !== assetId);
        }

        return [...current, assetId];
      });
      return;
    }

    setSelectedAssetId(assetId);
    setPreviewOpen(true);
  };

  const loadCroquisConfiguration = useCallback(async () => {
    const loadSequence = croquisConfigLoadSequenceRef.current + 1;
    croquisConfigLoadSequenceRef.current = loadSequence;
    setIsCroquisConfigLoading(true);
    setCroquisConfigError(null);

    try {
      const [nextPresets, nextSettings] = await Promise.all([
        ipc.session.listPresets(),
        ipc.library.loadSettingsSnapshot(),
      ]);

      if (croquisConfigLoadSequenceRef.current !== loadSequence) {
        return false;
      }

      setSessionPresets(nextPresets);
      setLibrarySettings(nextSettings);
      return true;
    } catch (nextError) {
      if (croquisConfigLoadSequenceRef.current !== loadSequence) {
        return false;
      }

      setSessionPresets([]);
      setCroquisConfigError(
        getErrorMessage(nextError, 'Failed to load Croquis session configuration.'),
      );
      return false;
    } finally {
      if (croquisConfigLoadSequenceRef.current === loadSequence) {
        setIsCroquisConfigLoading(false);
      }
    }
  }, []);

  const handleSelectionModeChange = useCallback(
    (nextSelectionMode: boolean) => {
      setSelectionMode(nextSelectionMode);
      if (!nextSelectionMode) {
        setSelectedAssetIds([]);
        return;
      }

      setSelectedAssetIds(current => {
        if (current.length > 0) {
          return current;
        }

        return selectedAssetId && assets.some(asset => asset.id === selectedAssetId)
          ? [selectedAssetId]
          : [];
      });
    },
    [assets, selectedAssetId],
  );

  const handleSelectAllChange = useCallback(
    (selected: boolean) => {
      setSelectedAssetIds(selected ? assets.map(asset => asset.id) : []);
    },
    [assets],
  );

  const applyAssetFolderUpdate = useCallback(
    async (assetIds: string[], virtualFolderIds: string[], mode: BatchUpdateAssetFoldersMode) => {
      setAssetActionBusy(true);
      setAssetActionError(null);

      try {
        const updatedDetails = await ipc.asset.batchUpdateFolders({
          assetIds,
          virtualFolderIds,
          mode,
        });

        setSelectedAssetDetail(current => {
          if (!selectedAssetId && !current) {
            return current;
          }

          const targetId = current?.id ?? selectedAssetId;
          const updatedDetail = updatedDetails.find(detail => detail.id === targetId);
          return updatedDetail ?? current;
        });
        await loadAssets();
        try {
          await onExplorerRefresh?.();
        } catch (refreshError) {
          setAssetActionError(getErrorMessage(refreshError, 'Failed to refresh explorer.'));
        }
        return true;
      } catch (nextError) {
        setAssetActionError(getErrorMessage(nextError, 'Failed to update asset folders.'));
        return false;
      } finally {
        setAssetActionBusy(false);
      }
    },
    [loadAssets, onExplorerRefresh, selectedAssetId],
  );

  const openFolderAction = useCallback((action: FolderAction) => {
    const loadSequence = folderActionLoadSequenceRef.current + 1;
    folderActionLoadSequenceRef.current = loadSequence;

    setFolderAction(action);
    setFolderActionFolderId('');
    setFolderActionFolders([]);
    setFolderActionError(null);
    setFolderActionLoading(true);

    void ipc.library
      .loadExplorerSnapshot()
      .then(snapshot => {
        if (folderActionLoadSequenceRef.current !== loadSequence) {
          return;
        }

        setFolderActionFolders(getSelectableFolders(snapshot));
      })
      .catch((nextError: unknown) => {
        if (folderActionLoadSequenceRef.current !== loadSequence) {
          return;
        }

        setFolderActionError(getErrorMessage(nextError, 'Failed to load folders.'));
      })
      .finally(() => {
        if (folderActionLoadSequenceRef.current === loadSequence) {
          setFolderActionLoading(false);
        }
      });
  }, []);

  const handleCloseFolderAction = useCallback(() => {
    folderActionLoadSequenceRef.current += 1;
    setFolderAction(null);
    setFolderActionFolderId('');
    setFolderActionError(null);
    setFolderActionBusy(false);
    setFolderActionLoading(false);
  }, []);

  const handleApplyFolderAction = useCallback(() => {
    if (!folderAction || !folderActionFolderId) {
      return;
    }

    setFolderActionBusy(true);
    setFolderActionError(null);

    void applyAssetFolderUpdate(
      folderAction.assetIds,
      [folderActionFolderId],
      folderAction.mode,
    ).then(updated => {
      setFolderActionBusy(false);
      if (updated) {
        handleCloseFolderAction();
        return;
      }

      setFolderActionError('Failed to update asset folders.');
    });
  }, [applyAssetFolderUpdate, folderAction, folderActionFolderId, handleCloseFolderAction]);

  const handlePreviewAddFolder = useCallback(
    (assetId: string) => {
      openFolderAction({ assetIds: [assetId], mode: 'append' });
    },
    [openFolderAction],
  );

  const handlePreviewRemoveFolder = useCallback(
    (assetId: string, folderId: string) => {
      const nextFolderIds =
        selectedAssetDetail?.id === assetId
          ? selectedAssetDetail.virtualFolders
              .filter(folder => folder.id !== folderId)
              .map(folder => folder.id)
          : [];

      void applyAssetFolderUpdate([assetId], nextFolderIds, 'replace');
    },
    [applyAssetFolderUpdate, selectedAssetDetail],
  );

  const handleAddSelectedToFolder = useCallback(() => {
    if (selectedAssetIds.length === 0) {
      return;
    }

    openFolderAction({ assetIds: selectedAssetIds, mode: 'append' });
  }, [openFolderAction, selectedAssetIds]);

  const handleMoveSelectedToFolder = useCallback(() => {
    if (selectedAssetIds.length === 0) {
      return;
    }

    openFolderAction({ assetIds: selectedAssetIds, mode: 'replace' });
  }, [openFolderAction, selectedAssetIds]);

  const openCroquisForAssets = useCallback(
    (assetIds: string[]) => {
      if (assetIds.length === 0 || isCroquisConfigLoading) {
        return;
      }

      void loadCroquisConfiguration().then(configurationLoaded => {
        if (configurationLoaded) {
          setCroquisAssetIds(assetIds);
          setCroquisModalOpen(true);
        }
      });
    },
    [isCroquisConfigLoading, loadCroquisConfiguration],
  );

  const handleStartCroquis = useCallback(() => {
    if (selectedAssetIds.length === 0) {
      return;
    }

    openCroquisForAssets(selectedAssetIds);
  }, [openCroquisForAssets, selectedAssetIds]);

  const handleCloseCroquisModal = useCallback(() => {
    setCroquisModalOpen(false);
    setCroquisAssetIds([]);
  }, []);

  const handleCroquisStarted = useCallback(() => {
    setCroquisModalOpen(false);
    setCroquisAssetIds([]);
    setSelectionMode(false);
    setSelectedAssetIds([]);
  }, []);

  const folderActionModalBusy = folderActionBusy || folderActionLoading || assetActionBusy;
  const folderActionSelectDisabled =
    folderActionModalBusy || !folderActionFolderId || folderActionFolders.length === 0;
  const statusError = assetActionError ?? croquisConfigError;

  return (
    <>
      <LibraryWorkspace
        mode="references"
        items={items}
        layout={layout}
        selectedItemId={selectedAssetId ?? undefined}
        selectedItemIds={selectedAssetIds}
        selectionMode={selectionMode}
        gridAriaLabel="References"
        previewOpen={previewOpen}
        gridBusy={isLoading}
        gridEmptyState={gridEmptyState}
        onLayoutChange={setLayout}
        onSelectedItemChange={handleSelectedAssetChange}
        renderHeader={headerProps => <ReferenceExplorerHeader {...headerProps} />}
        renderToolbar={
          <ReferenceSelectionToolbar
            selectionMode={selectionMode}
            selectedCount={selectedAssetIds.length}
            totalCount={assets.length}
            croquisDisabled={isCroquisConfigLoading}
            folderActionsDisabled={assetActionBusy || folderActionModalBusy}
            onSelectionModeChange={handleSelectionModeChange}
            onSelectAllChange={handleSelectAllChange}
            onAddToFolder={handleAddSelectedToFolder}
            onMoveToFolder={handleMoveSelectedToFolder}
            onStartCroquis={handleStartCroquis}
          />
        }
        renderTile={(asset, tileState) => (
          <ReferenceMasonryTile
            asset={asset}
            layout={tileState.layout}
            selected={tileState.selected}
            selectionIndex={tileState.selectionIndex}
            selectionMode={tileState.selectionMode}
            onSelect={tileState.onSelect}
          />
        )}
        renderPreview={asset => (
          <AssetPreviewPanel
            asset={asset}
            busy={assetActionBusy || isCroquisConfigLoading}
            onClose={() => {
              setPreviewOpen(false);
            }}
            onAddFolder={handlePreviewAddFolder}
            onRemoveFolder={handlePreviewRemoveFolder}
            onStartCroquis={assetId => {
              openCroquisForAssets([assetId]);
            }}
          />
        )}
      />
      <FolderSearchModal
        open={folderAction !== null}
        folders={folderActionFolders}
        folderId={folderActionFolderId}
        folderDisabled={folderActionModalBusy}
        busy={folderActionModalBusy}
        errorMessage={folderActionError}
        selectFolderDisabled={folderActionSelectDisabled}
        onClose={handleCloseFolderAction}
        onFolderChange={setFolderActionFolderId}
        onSelectFolder={handleApplyFolderAction}
      />
      <CroquisStartModal
        open={croquisModalOpen}
        assetIds={croquisAssetIds}
        sessionPresets={sessionPresets}
        librarySettings={librarySettings}
        onClose={handleCloseCroquisModal}
        onStarted={handleCroquisStarted}
      />
      {statusError ? (
        <div className="reference-croquis-config-error" role="status">
          {statusError}
        </div>
      ) : null}
    </>
  );
}

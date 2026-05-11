import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CroquisStartModal } from '../../croquis/ui/CroquisStartModal';
import { getErrorMessage } from '../../../shared/lib/error';
import { ipc } from '../../../shared/lib/ipc';
import type {
  AssetDetail,
  AssetListSource,
  AssetRecordCount,
  AssetSummary,
  BatchUpdateAssetFoldersMode,
  CroquisRecordDetail,
  CroquisRecordSummary,
  ExplorerSnapshot,
  SessionPreset,
  Tag,
  TagGroup,
  TimeStepPreset,
  VirtualFolder,
} from '../../../shared/types';
import { Button } from '../../../shared/ui';
import { LibraryWorkspace } from '../common/LibraryWorkspace';
import type { LibraryWorkspaceLayout } from '../common/types';
import { DropImportWarningModal, FolderSearchModal } from '../import';
import { DROP_IMAGE_WARNING_THRESHOLD } from '../import/dropFileData';
import { AssetPreviewPanel } from './AssetPreviewPanel';
import { createReferenceAsset } from './referenceAssets';
import { ReferenceExplorerHeader } from './ReferenceExplorerHeader';
import { ReferenceMasonryTile } from './ReferenceMasonryTile';
import { ReferenceSelectionToolbar } from './ReferenceSelectionToolbar';
import { useReferenceDropImport } from './lib/useReferenceDropImport';
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

function createAssetRecordCountMap(
  assets: readonly AssetSummary[],
  recordCounts: readonly AssetRecordCount[],
) {
  const assetIds = new Set(assets.map(asset => asset.id));
  const recordCountsById = new Map(assets.map(asset => [asset.id, 0]));

  for (const recordCount of recordCounts) {
    if (assetIds.has(recordCount.assetId)) {
      recordCountsById.set(recordCount.assetId, recordCount.relatedRecordCount);
    }
  }

  return recordCountsById;
}

function mergeCachedAssetDetails(
  current: Map<string, AssetDetail>,
  updatedDetails: readonly AssetDetail[],
) {
  if (updatedDetails.length === 0 || current.size === 0) {
    return current;
  }

  let changed = false;
  const nextDetailsById = new Map(current);

  for (const detail of updatedDetails) {
    if (nextDetailsById.has(detail.id)) {
      nextDetailsById.set(detail.id, detail);
      changed = true;
    }
  }

  return changed ? nextDetailsById : current;
}

function mergeCachedAssetRecordCounts(
  current: Map<string, number>,
  updatedDetails: readonly AssetDetail[],
) {
  if (updatedDetails.length === 0 || current.size === 0) {
    return current;
  }

  let changed = false;
  const nextRecordCountsById = new Map(current);

  for (const detail of updatedDetails) {
    if (nextRecordCountsById.has(detail.id)) {
      nextRecordCountsById.set(detail.id, detail.relatedRecords.length);
      changed = true;
    }
  }

  return changed ? nextRecordCountsById : current;
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
  const { i18n, t } = useTranslation('common');
  const [layout, setLayout] = useState<LibraryWorkspaceLayout>('masonry');
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedAssetDetail, setSelectedAssetDetail] = useState<AssetDetail | null>(null);
  const [assetDetailsById, setAssetDetailsById] = useState(() => new Map<string, AssetDetail>());
  const [assetRecordCountsById, setAssetRecordCountsById] = useState(
    () => new Map<string, number>(),
  );
  const [relatedRecordDetailsById, setRelatedRecordDetailsById] = useState(
    () => new Map<string, CroquisRecordDetail>(),
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [noRecordFilterSelected, setNoRecordFilterSelected] = useState(false);
  const [noRecordFilterLoading, setNoRecordFilterLoading] = useState(false);
  const [noRecordFilterError, setNoRecordFilterError] = useState<string | null>(null);
  const [noRecordFilterRefreshKey, setNoRecordFilterRefreshKey] = useState(0);
  const [croquisModalOpen, setCroquisModalOpen] = useState(false);
  const [croquisAssetIds, setCroquisAssetIds] = useState<string[]>([]);
  const [sessionPresets, setSessionPresets] = useState<SessionPreset[]>([]);
  const [timeStepPresets, setTimeStepPresets] = useState<TimeStepPreset[]>([]);
  const [tagGroups, setTagGroups] = useState<TagGroup[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
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
  const noRecordFilterLoadSequenceRef = useRef(0);
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
      setError(
        getErrorMessage(
          nextError,
          t('references.error.load_assets', { defaultValue: 'Failed to load assets.' }),
        ),
      );
    } finally {
      if (loadSequenceRef.current === loadSequence) {
        setIsLoading(false);
      }
    }
  }, [source, t]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets, refreshKey]);

  useEffect(() => {
    const assetIds = new Set(assets.map(asset => asset.id));
    setSelectedAssetIds(current => current.filter(assetId => assetIds.has(assetId)));
    setAssetDetailsById(current => {
      let changed = false;
      const nextDetailsById = new Map<string, AssetDetail>();

      for (const [assetId, detail] of current.entries()) {
        if (assetIds.has(assetId)) {
          nextDetailsById.set(assetId, detail);
        } else {
          changed = true;
        }
      }

      return changed || nextDetailsById.size !== current.size ? nextDetailsById : current;
    });
    setAssetRecordCountsById(current => {
      let changed = false;
      const nextRecordCountsById = new Map<string, number>();

      for (const [assetId, recordCount] of current.entries()) {
        if (assetIds.has(assetId)) {
          nextRecordCountsById.set(assetId, recordCount);
        } else {
          changed = true;
        }
      }

      return changed || nextRecordCountsById.size !== current.size ? nextRecordCountsById : current;
    });
  }, [assets]);

  const {
    dropImportBusy,
    dropImportPreparing,
    dropImportError,
    dropImportWarning,
    dropImportTargetLabel,
    dropOverlayVisible,
    cancelLargeDropImport,
    continueLargeDropImport,
    dropShellProps,
  } = useReferenceDropImport({
    source,
    onAssetsRefresh: loadAssets,
    onExplorerRefresh,
  });

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
        setAssetDetailsById(current => new Map(current).set(detail.id, detail));
        setAssetRecordCountsById(current => {
          if (!current.has(detail.id)) {
            return current;
          }

          return new Map(current).set(detail.id, detail.relatedRecords.length);
        });
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
      assets.map(asset => {
        const detail =
          assetDetailsById.get(asset.id) ??
          (selectedAssetDetail?.id === asset.id ? selectedAssetDetail : undefined);

        return createReferenceAsset(
          asset,
          detail,
          selectedAssetDetail?.id === asset.id ? relatedRecordDetailsById : undefined,
          t,
          i18n.resolvedLanguage,
        );
      }),
    [
      assetDetailsById,
      assets,
      i18n.resolvedLanguage,
      relatedRecordDetailsById,
      selectedAssetDetail,
      t,
    ],
  );

  useEffect(() => {
    if (!noRecordFilterSelected) {
      noRecordFilterLoadSequenceRef.current += 1;
      setNoRecordFilterLoading(false);
      setNoRecordFilterError(null);
      return;
    }

    if (assets.length === 0) {
      setAssetRecordCountsById(new Map());
      setNoRecordFilterLoading(false);
      setNoRecordFilterError(null);
      return;
    }

    const loadSequence = noRecordFilterLoadSequenceRef.current + 1;
    noRecordFilterLoadSequenceRef.current = loadSequence;
    setNoRecordFilterLoading(true);
    setNoRecordFilterError(null);

    void ipc.asset
      .listRecordCounts(source)
      .then(recordCounts => {
        if (noRecordFilterLoadSequenceRef.current !== loadSequence) {
          return;
        }

        setAssetRecordCountsById(createAssetRecordCountMap(assets, recordCounts));
      })
      .catch((nextError: unknown) => {
        if (noRecordFilterLoadSequenceRef.current !== loadSequence) {
          return;
        }

        setAssetRecordCountsById(new Map());
        setNoRecordFilterError(getErrorMessage(nextError, 'Failed to load reference filter data.'));
      })
      .finally(() => {
        if (noRecordFilterLoadSequenceRef.current === loadSequence) {
          setNoRecordFilterLoading(false);
        }
      });
  }, [assets, noRecordFilterRefreshKey, noRecordFilterSelected, source]);

  const filteredItems = useMemo(() => {
    if (!noRecordFilterSelected) {
      return items;
    }

    if (noRecordFilterLoading || noRecordFilterError) {
      return [];
    }

    return items.filter(item => assetRecordCountsById.get(item.id) === 0);
  }, [
    assetRecordCountsById,
    items,
    noRecordFilterError,
    noRecordFilterLoading,
    noRecordFilterSelected,
  ]);

  const gridEmptyState = isLoading ? (
    <ReferenceGridState
      title={t('references.loading_assets', { defaultValue: 'Loading assets...' })}
    />
  ) : error ? (
    <ReferenceGridState
      title={t('references.failed_to_load_assets', { defaultValue: 'Failed to load assets' })}
      description={error}
      action={
        <Button size="sm" onClick={() => void loadAssets()}>
          {t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      }
    />
  ) : noRecordFilterLoading ? (
    <ReferenceGridState title="Loading filter data..." />
  ) : noRecordFilterError ? (
    <ReferenceGridState
      title="Failed to load filter data"
      description={noRecordFilterError}
      action={
        <Button
          size="sm"
          onClick={() => {
            setNoRecordFilterLoading(true);
            setNoRecordFilterError(null);
            setNoRecordFilterRefreshKey(current => current + 1);
          }}
        >
          Retry
        </Button>
      }
    />
  ) : noRecordFilterSelected ? (
    <ReferenceGridState title="No references without records" />
  ) : (
    <ReferenceGridState title={t('references.empty', { defaultValue: 'No assets in this view' })} />
  );

  useEffect(() => {
    const itemIds = new Set(filteredItems.map(item => item.id));
    setSelectedAssetIds(current => current.filter(assetId => itemIds.has(assetId)));
    if (selectedAssetId && noRecordFilterSelected && !noRecordFilterLoading) {
      if (!itemIds.has(selectedAssetId)) {
        setSelectedAssetId(null);
        setPreviewOpen(false);
      }
    }
  }, [filteredItems, noRecordFilterLoading, noRecordFilterSelected, selectedAssetId]);

  const handleNoRecordFilterChange = useCallback((selected: boolean) => {
    setNoRecordFilterSelected(selected);
    if (!selected) {
      setNoRecordFilterError(null);
      return;
    }

    setNoRecordFilterLoading(true);
    setNoRecordFilterRefreshKey(current => current + 1);
  }, []);

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
      const [nextPresets, nextTimeStepPresets, nextTagIndex] = await Promise.all([
        ipc.session.listPresets(),
        ipc.session.listTimeStepPresets(),
        ipc.tag.loadIndex(),
      ]);

      if (croquisConfigLoadSequenceRef.current !== loadSequence) {
        return false;
      }

      setSessionPresets(nextPresets);
      setTimeStepPresets(nextTimeStepPresets);
      setTagGroups(nextTagIndex.groups);
      setTags(nextTagIndex.tags);
      return true;
    } catch (nextError) {
      if (croquisConfigLoadSequenceRef.current !== loadSequence) {
        return false;
      }

      setSessionPresets([]);
      setTimeStepPresets([]);
      setTagGroups([]);
      setTags([]);
      setCroquisConfigError(
        getErrorMessage(
          nextError,
          t('croquis.error.load_configuration', {
            defaultValue: 'Failed to load Croquis session configuration.',
          }),
        ),
      );
      return false;
    } finally {
      if (croquisConfigLoadSequenceRef.current === loadSequence) {
        setIsCroquisConfigLoading(false);
      }
    }
  }, [t]);

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

        return selectedAssetId && filteredItems.some(asset => asset.id === selectedAssetId)
          ? [selectedAssetId]
          : [];
      });
    },
    [filteredItems, selectedAssetId],
  );

  const handleSelectAllChange = useCallback(
    (selected: boolean) => {
      setSelectedAssetIds(selected ? filteredItems.map(asset => asset.id) : []);
    },
    [filteredItems],
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
        const updatedDetailsById = new Map(updatedDetails.map(detail => [detail.id, detail]));

        setSelectedAssetDetail(current => {
          if (!selectedAssetId && !current) {
            return current;
          }

          const targetId = current?.id ?? selectedAssetId;
          const updatedDetail = targetId ? updatedDetailsById.get(targetId) : undefined;
          return updatedDetail ?? current;
        });
        setAssetDetailsById(current => mergeCachedAssetDetails(current, updatedDetails));
        setAssetRecordCountsById(current => mergeCachedAssetRecordCounts(current, updatedDetails));
        await loadAssets();
        try {
          await onExplorerRefresh?.();
        } catch (refreshError) {
          setAssetActionError(
            getErrorMessage(
              refreshError,
              t('explorer.error.refresh', { defaultValue: 'Failed to refresh explorer.' }),
            ),
          );
        }
        return true;
      } catch (nextError) {
        setAssetActionError(
          getErrorMessage(
            nextError,
            t('references.error.update_asset_folders', {
              defaultValue: 'Failed to update asset folders.',
            }),
          ),
        );
        return false;
      } finally {
        setAssetActionBusy(false);
      }
    },
    [loadAssets, onExplorerRefresh, selectedAssetId, t],
  );

  const openFolderAction = useCallback(
    (action: FolderAction) => {
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

          setFolderActionError(
            getErrorMessage(
              nextError,
              t('folders.error.load', { defaultValue: 'Failed to load folders.' }),
            ),
          );
        })
        .finally(() => {
          if (folderActionLoadSequenceRef.current === loadSequence) {
            setFolderActionLoading(false);
          }
        });
    },
    [t],
  );

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

      setFolderActionError(
        t('references.error.update_asset_folders', {
          defaultValue: 'Failed to update asset folders.',
        }),
      );
    });
  }, [applyAssetFolderUpdate, folderAction, folderActionFolderId, handleCloseFolderAction, t]);

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
  const statusError = dropImportError ?? assetActionError ?? croquisConfigError;

  return (
    <>
      <div className="references-view-drop-shell" {...dropShellProps}>
        <LibraryWorkspace
          mode="references"
          items={filteredItems}
          layout={layout}
          selectedItemId={selectedAssetId ?? undefined}
          selectedItemIds={selectedAssetIds}
          selectionMode={selectionMode}
          gridAriaLabel={t('references.title', { defaultValue: 'References' })}
          previewOpen={previewOpen}
          gridBusy={isLoading || noRecordFilterLoading}
          gridEmptyState={gridEmptyState}
          onLayoutChange={setLayout}
          onSelectedItemChange={handleSelectedAssetChange}
          renderHeader={headerProps => (
            <ReferenceExplorerHeader
              {...headerProps}
              filterExpanded={filterExpanded}
              noRecordFilterSelected={noRecordFilterSelected}
              onFilterExpandedChange={setFilterExpanded}
              onNoRecordFilterChange={handleNoRecordFilterChange}
            />
          )}
          renderToolbar={
            <ReferenceSelectionToolbar
              selectionMode={selectionMode}
              selectedCount={selectedAssetIds.length}
              totalCount={filteredItems.length}
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
        {dropOverlayVisible ? (
          <div className="reference-drop-overlay" aria-live="polite">
            <div className="reference-drop-overlay__card">
              <span className="reference-drop-overlay__title">
                {dropImportBusy
                  ? t('import.importing_assets', { defaultValue: 'Importing assets...' })
                  : dropImportPreparing
                    ? t('references.drop_import.reviewing_assets', {
                        defaultValue: 'Reviewing dropped assets...',
                      })
                    : t('references.drop_to_import', { defaultValue: 'Drop to import references' })}
              </span>
              <span className="reference-drop-overlay__copy">
                {dropImportBusy
                  ? t('references.saving_dropped_assets', {
                      defaultValue: 'Saving local files and web images to the library.',
                    })
                  : dropImportPreparing
                    ? t('references.drop_import.counting_assets', {
                        defaultValue: 'Counting supported image files before import starts.',
                      })
                    : t('references.drop_supported_hint', {
                        target: dropImportTargetLabel,
                        defaultValue: 'Local image files and web images are supported. {{target}}',
                      })}
              </span>
            </div>
          </div>
        ) : null}
      </div>
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
        timeStepPresets={timeStepPresets}
        tags={tags}
        tagGroups={tagGroups}
        onClose={handleCloseCroquisModal}
        onStarted={handleCroquisStarted}
      />
      <DropImportWarningModal
        open={dropImportWarning !== null}
        itemCount={dropImportWarning?.itemCount}
        countIsExact={dropImportWarning?.countIsExact}
        threshold={DROP_IMAGE_WARNING_THRESHOLD}
        onCancel={cancelLargeDropImport}
        onContinue={continueLargeDropImport}
      />
      {statusError ? (
        <div className="reference-croquis-config-error" role="status">
          {statusError}
        </div>
      ) : null}
    </>
  );
}

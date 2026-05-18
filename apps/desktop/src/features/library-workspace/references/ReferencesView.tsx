import { useCallback, useEffect, useMemo, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CroquisStartModal } from '@/features/croquis';
import { useKeybindings } from '@/shared/hooks';
import { useShortcutFocusStore } from '@/shared/lib/keybindings';
import type { AssetDetail, AssetListSource } from '../../../shared/types';
import { Button } from '../../../shared/ui';
import { LibraryWorkspace } from '../common/LibraryWorkspace';
import type { LibraryWorkspaceLayout } from '../common/types';
import { DropImportWarningModal } from '../import';
import { DROP_IMAGE_WARNING_THRESHOLD } from '../import/dropFileData';
import { AssetPreviewPanel } from './AssetPreviewPanel';
import { createReferenceAsset } from './referenceAssets';
import { ReferenceExplorerHeader } from './ReferenceExplorerHeader';
import { ReferenceMasonryTile } from './ReferenceMasonryTile';
import { ReferenceSelectionToolbar } from './ReferenceSelectionToolbar';
import { useReferenceDropImport } from './lib/useReferenceDropImport';
import { useAssetFolderAction } from './model/useAssetFolderAction';
import { useNoRecordFilter } from './model/useNoRecordFilter';
import { useReferenceAssets } from './model/useReferenceAssets';
import { useReferenceCroquisLauncher } from './model/useReferenceCroquisLauncher';
import { useSelectedAssetDetail } from './model/useSelectedAssetDetail';
import { ReferenceDropOverlay } from './ui/ReferenceDropOverlay';
import { ReferenceFolderActionModal } from './ui/ReferenceFolderActionModal';
import { ReferenceGridState } from './ui/ReferenceGridState';
import './reference-workspace.css';

type ReferencesViewProps = {
  source: AssetListSource;
  modalOpen?: boolean;
  refreshKey?: number;
  onExplorerRefresh?: () => Promise<void> | void;
};

export function ReferencesView({
  source,
  modalOpen = false,
  refreshKey = 0,
  onExplorerRefresh,
}: ReferencesViewProps) {
  const { i18n, t } = useTranslation('common');
  const shortcutFocusArea = useShortcutFocusStore(state => state.area);
  const focusedAssetId = useShortcutFocusStore(state => state.referenceAssetId);
  const focusReferenceGrid = useShortcutFocusStore(state => state.focusReferenceGrid);
  const setReferenceAssetId = useShortcutFocusStore(state => state.setReferenceAssetId);
  const setShortcutFocusArea = useShortcutFocusStore(state => state.setArea);
  const [layout, setLayout] = useState<LibraryWorkspaceLayout>('masonry');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const referenceViewFocus =
    shortcutFocusArea === 'references' || shortcutFocusArea === 'references.grid';
  const referencePreviewFocus = shortcutFocusArea === 'references.preview';
  const gridFocus = referenceViewFocus;
  const { assets, isLoading, error, loadAssets } = useReferenceAssets({ source, refreshKey });
  const {
    assetRecordCountsById,
    selected: noRecordFilterSelected,
    loading: noRecordFilterLoading,
    error: noRecordFilterError,
    changeSelected: changeNoRecordFilterSelected,
    retry: retryNoRecordFilter,
    updateRecordCount,
    mergeRecordCounts,
  } = useNoRecordFilter({ assets, source });
  const handlePreviewClose = useCallback(() => {
    setPreviewOpen(false);
    focusReferenceGrid(selectedAssetId ?? focusedAssetId ?? null);
  }, [focusReferenceGrid, focusedAssetId, selectedAssetId]);
  const { selectedAssetDetail, assetDetailsById, relatedRecordDetailsById, mergeAssetDetails } =
    useSelectedAssetDetail({
      assets,
      selectedAssetId,
      onPreviewClose: handlePreviewClose,
      onRecordCountChange: updateRecordCount,
    });

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
      assets,
      i18n.resolvedLanguage,
      assetDetailsById,
      relatedRecordDetailsById,
      selectedAssetDetail,
      t,
    ],
  );

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

  const handleAssetsUpdated = useCallback(
    (updatedDetails: readonly AssetDetail[]) => {
      mergeAssetDetails(updatedDetails);
      mergeRecordCounts(updatedDetails);
    },
    [mergeAssetDetails, mergeRecordCounts],
  );

  const {
    assetActionBusy,
    assetActionError,
    folderAction,
    folderActionFolders,
    folderActionFolderId,
    folderActionModalBusy,
    folderActionSelectDisabled,
    folderActionError,
    applyAssetFolderUpdate,
    openFolderAction,
    closeFolderAction,
    applyFolderAction,
    setFolderActionFolderId,
  } = useAssetFolderAction({
    loadAssets,
    onExplorerRefresh,
    onAssetsUpdated: handleAssetsUpdated,
  });

  const handleCroquisStarted = useCallback(() => {
    setSelectionMode(false);
    setSelectedAssetIds([]);
  }, []);

  const {
    croquisModalOpen,
    croquisAssetIds,
    sessionPresets,
    timeStepPresets,
    tags,
    tagGroups,
    isCroquisConfigLoading,
    croquisConfigError,
    openCroquisForAssets,
    startCroquisForSelectedAssets,
    closeCroquisModal,
    handleCroquisStarted: handleCroquisModalStarted,
  } = useReferenceCroquisLauncher({
    selectedAssetIds,
    onStarted: handleCroquisStarted,
  });

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
    pasteEnabled: !modalOpen && folderAction === null && !croquisModalOpen,
    onAssetsRefresh: loadAssets,
    onExplorerRefresh,
  });

  useEffect(() => {
    if (!error) {
      return;
    }

    setSelectedAssetId(null);
    setPreviewOpen(false);
  }, [error]);

  useEffect(() => {
    const assetIds = new Set(assets.map(asset => asset.id));
    setSelectedAssetIds(current => retainIdsInSet(current, assetIds));
  }, [assets]);

  useEffect(() => {
    const itemIds = new Set(filteredItems.map(item => item.id));
    if (focusedAssetId && !itemIds.has(focusedAssetId)) {
      setReferenceAssetId(null);
    }
    setSelectedAssetIds(current => retainIdsInSet(current, itemIds));
    if (selectedAssetId && noRecordFilterSelected && !noRecordFilterLoading) {
      if (!itemIds.has(selectedAssetId)) {
        setSelectedAssetId(null);
        setPreviewOpen(false);
      }
    }
  }, [
    filteredItems,
    focusedAssetId,
    noRecordFilterLoading,
    noRecordFilterSelected,
    selectedAssetId,
    setReferenceAssetId,
  ]);

  const handleSelectedAssetChange = (assetId: string) => {
    focusReferenceGrid(assetId);

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

        const activeAssetId = focusedAssetId ?? selectedAssetId;

        return activeAssetId && filteredItems.some(asset => asset.id === activeAssetId)
          ? [activeAssetId]
          : [];
      });
    },
    [filteredItems, focusedAssetId, selectedAssetId],
  );

  const handleSelectAllChange = useCallback(
    (selected: boolean) => {
      setSelectedAssetIds(selected ? filteredItems.map(asset => asset.id) : []);
    },
    [filteredItems],
  );

  const handleLayoutToggle = useCallback(() => {
    setLayout(current => (current === 'masonry' ? 'grid' : 'masonry'));
  }, []);

  const getActiveReferenceId = useCallback(() => {
    if (focusedAssetId && filteredItems.some(item => item.id === focusedAssetId)) {
      return focusedAssetId;
    }

    if (selectedAssetId) {
      return selectedAssetId;
    }

    return filteredItems[0]?.id ?? null;
  }, [filteredItems, focusedAssetId, selectedAssetId]);

  const handlePreviewOpen = useCallback(() => {
    if (selectionMode) {
      return;
    }

    const assetId = getActiveReferenceId();
    if (!assetId) {
      return;
    }

    setSelectedAssetId(assetId);
    setReferenceAssetId(assetId);
    setPreviewOpen(true);
  }, [getActiveReferenceId, selectionMode, setReferenceAssetId]);

  const handleSelectionToggleItem = useCallback(() => {
    if (!selectionMode) {
      return;
    }

    const assetId = getActiveReferenceId();
    if (!assetId) {
      return;
    }

    setSelectedAssetIds(current =>
      current.includes(assetId)
        ? current.filter(selectedAssetId => selectedAssetId !== assetId)
        : [...current, assetId],
    );
  }, [getActiveReferenceId, selectionMode]);

  const getShortcutReferenceId = useCallback(() => {
    const activeReferenceId = getActiveReferenceId();

    if (gridFocus) {
      return activeReferenceId;
    }

    return referencePreviewFocus && previewOpen ? selectedAssetId : null;
  }, [getActiveReferenceId, gridFocus, previewOpen, referencePreviewFocus, selectedAssetId]);

  const handleReferencePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!(event.target instanceof Element)) {
        return;
      }

      if (event.target.closest('.library-workspace__grid-region')) {
        focusReferenceGrid(getActiveReferenceId());
        return;
      }

      if (event.target.closest('.library-workspace__preview-shell')) {
        setShortcutFocusArea('references.preview');
        return;
      }

      setShortcutFocusArea('references');
    },
    [focusReferenceGrid, getActiveReferenceId, setShortcutFocusArea],
  );

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

  const handleShortcutCroquisStart = useCallback(() => {
    if (selectionMode) {
      startCroquisForSelectedAssets();
      return;
    }

    const assetId = getShortcutReferenceId();
    if (assetId) {
      openCroquisForAssets([assetId]);
    }
  }, [getShortcutReferenceId, openCroquisForAssets, selectionMode, startCroquisForSelectedAssets]);

  const handleCurrentViewRefresh = useCallback(() => {
    void (async () => {
      await loadAssets();
      await onExplorerRefresh?.();
    })();
  }, [loadAssets, onExplorerRefresh]);

  const referencesModalOpen =
    modalOpen || folderAction !== null || croquisModalOpen || dropImportWarning !== null;
  const activeReferenceId = getActiveReferenceId();
  const shortcutReferenceId = getShortcutReferenceId();
  const selectedReferenceCount = selectionMode
    ? selectedAssetIds.length
    : shortcutReferenceId
      ? 1
      : 0;

  useKeybindings({
    context: {
      gridFocus,
      inputFocus: false,
      itemFocused: gridFocus && Boolean(activeReferenceId),
      libraryPage: true,
      modalOpen: referencesModalOpen,
      previewOpen,
      referencesView: true,
      selectedReferenceCount,
      selectionMode,
    },
    enabled: !referencesModalOpen,
    handlers: {
      'grim.currentView.filter.toggle': () => {
        setFilterExpanded(current => !current);
      },
      'grim.currentView.refresh': handleCurrentViewRefresh,
      'grim.references.croquis.start': handleShortcutCroquisStart,
      'grim.references.clipboard.paste': () => undefined,
      'grim.references.folder.add': handleAddSelectedToFolder,
      'grim.references.folder.move': handleMoveSelectedToFolder,
      'grim.references.layout.toggle': handleLayoutToggle,
      'grim.references.preview.close': handlePreviewClose,
      'grim.references.preview.open': handlePreviewOpen,
      'grim.references.selection.clear': () => {
        handleSelectionModeChange(false);
      },
      'grim.references.selection.selectAll': () => {
        handleSelectAllChange(true);
      },
      'grim.references.selection.toggleItem': handleSelectionToggleItem,
      'grim.references.selection.toggleMode': () => {
        handleSelectionModeChange(!selectionMode);
      },
    },
  });

  const gridEmptyState = getReferenceGridEmptyState({
    isLoading,
    error,
    noRecordFilterLoading: noRecordFilterLoading,
    noRecordFilterError: noRecordFilterError,
    noRecordFilterSelected: noRecordFilterSelected,
    onLoadAssets: loadAssets,
    onNoRecordFilterRetry: retryNoRecordFilter,
    t,
  });
  const statusError = dropImportError ?? assetActionError ?? croquisConfigError;

  return (
    <>
      <div
        className="references-view-drop-shell"
        {...dropShellProps}
        onPointerDownCapture={handleReferencePointerDown}
      >
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
          onFocusedItemChange={focusReferenceGrid}
          onSelectedItemChange={handleSelectedAssetChange}
          renderHeader={headerProps => (
            <ReferenceExplorerHeader
              {...headerProps}
              filterExpanded={filterExpanded}
              noRecordFilterSelected={noRecordFilterSelected}
              onFilterExpandedChange={setFilterExpanded}
              onNoRecordFilterChange={changeNoRecordFilterSelected}
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
              onStartCroquis={startCroquisForSelectedAssets}
            />
          }
          renderTile={(asset, tileState) => (
            <ReferenceMasonryTile
              asset={asset}
              layout={tileState.layout}
              selected={tileState.selected}
              selectionIndex={tileState.selectionIndex}
              selectionMode={tileState.selectionMode}
              onFocus={tileState.onFocus}
              onSelect={tileState.onSelect}
            />
          )}
          renderPreview={asset => (
            <AssetPreviewPanel
              asset={asset}
              busy={assetActionBusy || isCroquisConfigLoading}
              onClose={handlePreviewClose}
              onAddFolder={handlePreviewAddFolder}
              onRemoveFolder={handlePreviewRemoveFolder}
              onStartCroquis={assetId => {
                openCroquisForAssets([assetId]);
              }}
            />
          )}
        />
        <ReferenceDropOverlay
          visible={dropOverlayVisible}
          busy={dropImportBusy}
          preparing={dropImportPreparing}
          targetLabel={dropImportTargetLabel}
        />
      </div>
      <ReferenceFolderActionModal
        open={folderAction !== null}
        folders={folderActionFolders}
        folderId={folderActionFolderId}
        busy={folderActionModalBusy}
        error={folderActionError}
        selectDisabled={folderActionSelectDisabled}
        onClose={closeFolderAction}
        onFolderChange={setFolderActionFolderId}
        onSelectFolder={applyFolderAction}
      />
      <CroquisStartModal
        open={croquisModalOpen}
        assetIds={croquisAssetIds}
        sessionPresets={sessionPresets}
        timeStepPresets={timeStepPresets}
        tags={tags}
        tagGroups={tagGroups}
        onClose={closeCroquisModal}
        onStarted={handleCroquisModalStarted}
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

function retainIdsInSet(current: string[], allowedIds: ReadonlySet<string>) {
  const next = current.filter(id => allowedIds.has(id));
  return next.length === current.length ? current : next;
}

type ReferenceGridEmptyStateOptions = {
  isLoading: boolean;
  error: string | null;
  noRecordFilterLoading: boolean;
  noRecordFilterError: string | null;
  noRecordFilterSelected: boolean;
  onLoadAssets: () => Promise<void> | void;
  onNoRecordFilterRetry: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

function getReferenceGridEmptyState({
  isLoading,
  error,
  noRecordFilterLoading,
  noRecordFilterError,
  noRecordFilterSelected,
  onLoadAssets,
  onNoRecordFilterRetry,
  t,
}: ReferenceGridEmptyStateOptions) {
  if (isLoading) {
    return (
      <ReferenceGridState
        title={t('references.loading_assets', { defaultValue: 'Loading assets...' })}
      />
    );
  }

  if (error) {
    return (
      <ReferenceGridState
        title={t('references.failed_to_load_assets', { defaultValue: 'Failed to load assets' })}
        description={error}
        action={
          <Button size="sm" onClick={() => void onLoadAssets()}>
            {t('common.retry', { defaultValue: 'Retry' })}
          </Button>
        }
      />
    );
  }

  if (noRecordFilterLoading) {
    return (
      <ReferenceGridState
        title={t('references.filters.loading', { defaultValue: 'Loading filter data...' })}
      />
    );
  }

  if (noRecordFilterError) {
    return (
      <ReferenceGridState
        title={t('references.filters.failed_to_load', {
          defaultValue: 'Failed to load filter data',
        })}
        description={noRecordFilterError}
        action={
          <Button size="sm" onClick={onNoRecordFilterRetry}>
            {t('common.retry', { defaultValue: 'Retry' })}
          </Button>
        }
      />
    );
  }

  if (noRecordFilterSelected) {
    return (
      <ReferenceGridState
        title={t('references.filters.no_references_without_records', {
          defaultValue: 'No references without records',
        })}
      />
    );
  }

  return (
    <ReferenceGridState title={t('references.empty', { defaultValue: 'No assets in this view' })} />
  );
}

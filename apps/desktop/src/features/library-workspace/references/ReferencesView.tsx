import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CroquisStartModal } from '@/features/croquis';
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
  refreshKey?: number;
  onExplorerRefresh?: () => Promise<void> | void;
};

export function ReferencesView({ source, refreshKey = 0, onExplorerRefresh }: ReferencesViewProps) {
  const { i18n, t } = useTranslation('common');
  const [layout, setLayout] = useState<LibraryWorkspaceLayout>('masonry');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [filterExpanded, setFilterExpanded] = useState(false);
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
  }, []);
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

  const folderAction = useAssetFolderAction({
    loadAssets,
    onExplorerRefresh,
    onAssetsUpdated: handleAssetsUpdated,
  });

  const handleCroquisStarted = useCallback(() => {
    setSelectionMode(false);
    setSelectedAssetIds([]);
  }, []);

  const croquisLauncher = useReferenceCroquisLauncher({
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
    setSelectedAssetIds(current => retainIdsInSet(current, itemIds));
    if (selectedAssetId && noRecordFilterSelected && !noRecordFilterLoading) {
      if (!itemIds.has(selectedAssetId)) {
        setSelectedAssetId(null);
        setPreviewOpen(false);
      }
    }
  }, [filteredItems, noRecordFilterLoading, noRecordFilterSelected, selectedAssetId]);

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

  const handlePreviewAddFolder = useCallback(
    (assetId: string) => {
      folderAction.openFolderAction({ assetIds: [assetId], mode: 'append' });
    },
    [folderAction],
  );

  const handlePreviewRemoveFolder = useCallback(
    (assetId: string, folderId: string) => {
      const nextFolderIds =
        selectedAssetDetail?.id === assetId
          ? selectedAssetDetail.virtualFolders
              .filter(folder => folder.id !== folderId)
              .map(folder => folder.id)
          : [];

      void folderAction.applyAssetFolderUpdate([assetId], nextFolderIds, 'replace');
    },
    [folderAction, selectedAssetDetail],
  );

  const handleAddSelectedToFolder = useCallback(() => {
    if (selectedAssetIds.length === 0) {
      return;
    }

    folderAction.openFolderAction({ assetIds: selectedAssetIds, mode: 'append' });
  }, [folderAction, selectedAssetIds]);

  const handleMoveSelectedToFolder = useCallback(() => {
    if (selectedAssetIds.length === 0) {
      return;
    }

    folderAction.openFolderAction({ assetIds: selectedAssetIds, mode: 'replace' });
  }, [folderAction, selectedAssetIds]);

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
  const statusError =
    dropImportError ?? folderAction.assetActionError ?? croquisLauncher.croquisConfigError;

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
              onNoRecordFilterChange={changeNoRecordFilterSelected}
            />
          )}
          renderToolbar={
            <ReferenceSelectionToolbar
              selectionMode={selectionMode}
              selectedCount={selectedAssetIds.length}
              totalCount={filteredItems.length}
              croquisDisabled={croquisLauncher.isCroquisConfigLoading}
              folderActionsDisabled={
                folderAction.assetActionBusy || folderAction.folderActionModalBusy
              }
              onSelectionModeChange={handleSelectionModeChange}
              onSelectAllChange={handleSelectAllChange}
              onAddToFolder={handleAddSelectedToFolder}
              onMoveToFolder={handleMoveSelectedToFolder}
              onStartCroquis={croquisLauncher.startCroquisForSelectedAssets}
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
              busy={folderAction.assetActionBusy || croquisLauncher.isCroquisConfigLoading}
              onClose={handlePreviewClose}
              onAddFolder={handlePreviewAddFolder}
              onRemoveFolder={handlePreviewRemoveFolder}
              onStartCroquis={assetId => {
                croquisLauncher.openCroquisForAssets([assetId]);
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
        open={folderAction.folderAction !== null}
        folders={folderAction.folderActionFolders}
        folderId={folderAction.folderActionFolderId}
        busy={folderAction.folderActionModalBusy}
        error={folderAction.folderActionError}
        selectDisabled={folderAction.folderActionSelectDisabled}
        onClose={folderAction.closeFolderAction}
        onFolderChange={folderAction.setFolderActionFolderId}
        onSelectFolder={folderAction.applyFolderAction}
      />
      <CroquisStartModal
        open={croquisLauncher.croquisModalOpen}
        assetIds={croquisLauncher.croquisAssetIds}
        sessionPresets={croquisLauncher.sessionPresets}
        timeStepPresets={croquisLauncher.timeStepPresets}
        tags={croquisLauncher.tags}
        tagGroups={croquisLauncher.tagGroups}
        onClose={croquisLauncher.closeCroquisModal}
        onStarted={croquisLauncher.handleCroquisStarted}
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

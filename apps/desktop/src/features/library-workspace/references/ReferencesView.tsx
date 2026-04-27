import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CroquisStartModal } from '../../croquis/ui/CroquisStartModal';
import { ipc } from '../../../shared/lib/ipc';
import type {
  AssetDetail,
  AssetListSource,
  AssetSummary,
  LibrarySettings,
  SessionPreset,
} from '../../../shared/types';
import { Button } from '../../../shared/ui';
import { LibraryWorkspace } from '../common/LibraryWorkspace';
import type { LibraryWorkspaceLayout } from '../common/types';
import { AssetPreviewPanel } from './AssetPreviewPanel';
import { createReferenceAsset } from './referenceAssets';
import { ReferenceExplorerHeader } from './ReferenceExplorerHeader';
import { ReferenceMasonryTile } from './ReferenceMasonryTile';
import { ReferenceSelectionToolbar } from './ReferenceSelectionToolbar';
import './reference-workspace.css';

type ReferencesViewProps = {
  source: AssetListSource;
  refreshKey?: number;
};

type ReferenceGridStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
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

export function ReferencesView({ source, refreshKey = 0 }: ReferencesViewProps) {
  const [layout, setLayout] = useState<LibraryWorkspaceLayout>('masonry');
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [selectedAssetDetail, setSelectedAssetDetail] = useState<AssetDetail | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [croquisModalOpen, setCroquisModalOpen] = useState(false);
  const [sessionPresets, setSessionPresets] = useState<SessionPreset[]>([]);
  const [librarySettings, setLibrarySettings] = useState<LibrarySettings>({});
  const [isCroquisConfigLoading, setIsCroquisConfigLoading] = useState(false);
  const [croquisConfigError, setCroquisConfigError] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);
  const croquisConfigLoadSequenceRef = useRef(0);

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
    if (!selectedAssetId) {
      setSelectedAssetDetail(null);
      setPreviewOpen(false);
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      try {
        const detail = await ipc.asset.getDetail(selectedAssetId);
        if (!cancelled) {
          setSelectedAssetDetail(detail);
        }
      } catch {
        if (!cancelled) {
          setSelectedAssetDetail(null);
        }
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedAssetId]);

  const items = useMemo(
    () =>
      assets.map(asset =>
        createReferenceAsset(
          asset,
          selectedAssetDetail?.id === asset.id ? selectedAssetDetail : undefined,
        ),
      ),
    [assets, selectedAssetDetail],
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

  const handleStartCroquis = useCallback(() => {
    if (selectedAssetIds.length === 0 || isCroquisConfigLoading) {
      return;
    }

    void loadCroquisConfiguration().then(configurationLoaded => {
      if (configurationLoaded) {
        setCroquisModalOpen(true);
      }
    });
  }, [isCroquisConfigLoading, loadCroquisConfiguration, selectedAssetIds.length]);

  const handleCloseCroquisModal = useCallback(() => {
    setCroquisModalOpen(false);
  }, []);

  const handleCroquisStarted = useCallback(() => {
    setCroquisModalOpen(false);
    setSelectionMode(false);
    setSelectedAssetIds([]);
  }, []);

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
            onSelectionModeChange={handleSelectionModeChange}
            onSelectAllChange={handleSelectAllChange}
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
            onClose={() => {
              setPreviewOpen(false);
            }}
          />
        )}
      />
      <CroquisStartModal
        open={croquisModalOpen}
        assetIds={selectedAssetIds}
        sessionPresets={sessionPresets}
        librarySettings={librarySettings}
        onClose={handleCloseCroquisModal}
        onStarted={handleCroquisStarted}
      />
      {croquisConfigError ? (
        <div className="reference-croquis-config-error" role="status">
          {croquisConfigError}
        </div>
      ) : null}
    </>
  );
}

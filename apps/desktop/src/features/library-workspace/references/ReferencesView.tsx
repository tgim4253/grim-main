import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ipc } from '../../../shared/lib/ipc';
import type { AssetDetail, AssetListSource, AssetSummary } from '../../../shared/types';
import { Button } from '../../../shared/ui';
import { LibraryWorkspace } from '../common/LibraryWorkspace';
import type { LibraryWorkspaceLayout } from '../common/types';
import { AssetPreviewPanel } from './AssetPreviewPanel';
import { createReferenceAsset } from './referenceAssets';
import { ReferenceExplorerHeader } from './ReferenceExplorerHeader';
import { ReferenceMasonryTile } from './ReferenceMasonryTile';
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
  const [selectedAssetDetail, setSelectedAssetDetail] = useState<AssetDetail | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);

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
    setSelectedAssetId(assetId);
    setPreviewOpen(true);
  };

  return (
    <LibraryWorkspace
      mode="references"
      items={items}
      layout={layout}
      selectedItemId={selectedAssetId ?? undefined}
      gridAriaLabel="References"
      previewOpen={previewOpen}
      gridBusy={isLoading}
      gridEmptyState={gridEmptyState}
      onLayoutChange={setLayout}
      onSelectedItemChange={handleSelectedAssetChange}
      renderHeader={headerProps => <ReferenceExplorerHeader {...headerProps} />}
      renderTile={(asset, tileState) => (
        <ReferenceMasonryTile
          asset={asset}
          layout={tileState.layout}
          selected={tileState.selected}
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
  );
}

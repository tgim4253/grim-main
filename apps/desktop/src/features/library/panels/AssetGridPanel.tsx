import { useEffect, useState } from 'react';
import { useWorkspaceTabsStore, type PanelTab } from '../../../entities/library/model';
import { cx } from '../../../shared/lib/cx';
import { ipc } from '../../../shared/lib/ipc';
import type { AssetSummary } from '../../../shared/types';
import { assetPreviewSrc, formatFileSize, getAssetExtension } from '../lib/helpers';

const EMPTY_SELECTION: string[] = [];

type AssetGridPanelProps = {
  tab: Extract<PanelTab, { type: 'assetGrid' }>;
  refreshToken: number;
  onOpenAsset: (asset: AssetSummary) => void;
};

export function AssetGridPanel({ tab, refreshToken, onOpenAsset }: AssetGridPanelProps) {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedAssetIdsByTab = useWorkspaceTabsStore(state => state.selectedAssetIdsByTab);
  const setSelection = useWorkspaceTabsStore(state => state.setSelection);
  const selection = selectedAssetIdsByTab[tab.id] ?? EMPTY_SELECTION;

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const nextAssets = await ipc.asset.list(tab.source);
        if (cancelled) {
          return;
        }

        setAssets(nextAssets);
        const currentSelection =
          useWorkspaceTabsStore.getState().selectedAssetIdsByTab[tab.id] ?? [];
        setSelection(
          tab.id,
          currentSelection.filter(assetId => nextAssets.some(asset => asset.id === assetId)),
        );
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load assets');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshToken, setSelection, tab.id, tab.source]);

  const toggleSelection = (assetId: string, additive: boolean) => {
    const next = additive
      ? selection.includes(assetId)
        ? selection.filter(id => id !== assetId)
        : [...selection, assetId]
      : selection.includes(assetId) && selection.length === 1
        ? []
        : [assetId];
    setSelection(tab.id, next);
  };

  if (loading) {
    return <div className="library-panel-state">Loading assets...</div>;
  }

  if (error) {
    return <div className="library-panel-state library-panel-state--error">{error}</div>;
  }

  if (assets.length === 0) {
    return (
      <div className="library-panel-state">
        No assets are available in this view yet. Import images into the library or connect them to
        the selected virtual folder.
      </div>
    );
  }

  return (
    <div className="library-panel">
      <div className="library-panel__header">
        <div className="library-panel__header-copy">
          <div className="app-kicker">Asset Grid</div>
          <h2 className="library-panel__title">{tab.title}</h2>
          <div className="library-panel__meta">
            {assets.length} items · {selection.length} selected
          </div>
          <p className="library-panel__hint">
            Click to select, use Cmd/Ctrl-click for multi-select, and double-click an asset to open
            its detail view.
          </p>
        </div>
        {selection.length > 0 ? (
          <div className="library-selection-banner">
            <span className="library-selection-banner__count">{String(selection.length)}</span>
            <span>queued for croquis</span>
          </div>
        ) : null}
      </div>

      <div className="library-asset-grid">
        {assets.map(asset => {
          const selected = selection.includes(asset.id);
          const preview = assetPreviewSrc(asset);

          return (
            <button
              key={asset.id}
              type="button"
              className={cx('library-asset-card', selected && 'library-asset-card--selected')}
              aria-pressed={selected}
              title={`${asset.fileName} — click to select, double-click to open`}
              onClick={event => {
                toggleSelection(asset.id, event.metaKey || event.ctrlKey);
              }}
              onDoubleClick={() => {
                onOpenAsset(asset);
              }}
            >
              <div className="library-asset-card__preview">
                <div className="library-asset-card__badges">
                  <span className="library-asset-chip">
                    {asset.type === 'linked_external' ? 'External' : 'Stored'}
                  </span>
                  {selected ? (
                    <span className="library-asset-chip library-asset-chip--selected">
                      Selected
                    </span>
                  ) : null}
                </div>
                {preview ? (
                  <img src={preview} alt={asset.fileName} className="library-asset-card__image" />
                ) : (
                  <div className="library-asset-card__fallback">
                    {asset.type === 'linked_external'
                      ? 'External Link'
                      : getAssetExtension(asset.fileName).toUpperCase() || 'Asset'}
                  </div>
                )}
              </div>

              <div className="library-asset-card__body">
                <strong className="library-asset-card__title">{asset.fileName}</strong>
                <div className="library-asset-card__meta">
                  <span>
                    {asset.width && asset.height
                      ? `${String(asset.width)}×${String(asset.height)}`
                      : 'No dimensions'}
                  </span>
                  <span>{formatFileSize(asset.fileSize)}</span>
                </div>
                <div className="library-asset-card__footnote">Double-click to open details</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

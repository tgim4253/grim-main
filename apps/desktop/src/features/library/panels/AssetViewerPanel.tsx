import { useEffect, useState } from 'react';
import { Button } from '../../../shared/ui';
import { ipc } from '../../../shared/lib/ipc';
import type { AssetDetail } from '../../../shared/types';
import type { PanelTab } from '../../../entities/library/model';
import { assetPreviewSrc, formatDateTime, formatFileSize } from '../lib/helpers';

type AssetViewerPanelProps = {
  tab: Extract<PanelTab, { type: 'assetViewer' }>;
  refreshToken: number;
  onOpenRecord: (recordId: string, title?: string) => void;
  onOpenFolderPicker: (asset: AssetDetail) => void;
  onOpenTagPicker: (asset: AssetDetail) => void;
};

export function AssetViewerPanel({
  tab,
  refreshToken,
  onOpenRecord,
  onOpenFolderPicker,
  onOpenTagPicker,
}: AssetViewerPanelProps) {
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const detail = await ipc.asset.getDetail(tab.assetId);
        if (!cancelled) {
          setAsset(detail);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load asset');
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
  }, [refreshToken, tab.assetId]);

  if (loading) {
    return <div className="library-panel-state">Loading asset...</div>;
  }

  if (error || !asset) {
    return (
      <div className="library-panel-state library-panel-state--error">
        {error ?? 'Asset not found'}
      </div>
    );
  }

  const preview = assetPreviewSrc(asset);
  const revealPath = asset.storagePath ?? asset.externalPath ?? null;

  return (
    <div className="library-viewer">
      <div className="library-viewer__preview">
        <div className="library-viewer__frame">
          {preview ? (
            <img src={preview} alt={asset.fileName} className="library-viewer__image" />
          ) : (
            <div className="library-panel-state">Preview unavailable for this asset type.</div>
          )}
        </div>
      </div>

      <div className="library-viewer__sidebar">
        <div className="library-viewer__section">
          <div className="app-kicker">Asset Viewer</div>
          <h2 className="library-viewer__title">{asset.fileName}</h2>
          <p className="library-viewer__copy">
            {asset.type === 'linked_external' ? 'Linked External File' : 'Imported Image'}
          </p>
        </div>

        <div className="library-stat-grid">
          <div className="library-stat-card">
            <span className="app-kicker">Resolution</span>
            <strong>
              {asset.width && asset.height
                ? `${String(asset.width)}×${String(asset.height)}`
                : 'Unknown'}
            </strong>
          </div>
          <div className="library-stat-card">
            <span className="app-kicker">File Size</span>
            <strong>{formatFileSize(asset.fileSize)}</strong>
          </div>
          <div className="library-stat-card">
            <span className="app-kicker">Folders</span>
            <strong>{String(asset.virtualFolders.length)}</strong>
          </div>
          <div className="library-stat-card">
            <span className="app-kicker">Updated</span>
            <strong>{formatDateTime(asset.updatedAt)}</strong>
          </div>
        </div>

        <div className="library-inline-actions">
          <Button
            variant="secondary"
            onClick={() => {
              onOpenFolderPicker(asset);
            }}
          >
            Assign Folders
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              onOpenTagPicker(asset);
            }}
          >
            Edit Tags
          </Button>
          {revealPath ? (
            <Button
              variant="secondary"
              onClick={() => {
                void ipc.asset.revealPath(revealPath);
              }}
            >
              Reveal File
            </Button>
          ) : null}
        </div>

        <div className="library-viewer__section">
          <div className="app-kicker">Path</div>
          <div className="library-path-card">
            <strong>{revealPath ? 'Stored Location' : 'No file path available'}</strong>
            <span>{revealPath ?? 'This asset does not expose a path yet.'}</span>
          </div>
        </div>

        <div className="library-viewer__section">
          <div className="app-kicker">Virtual Folders</div>
          <div className="library-pill-list">
            {asset.virtualFolders.length === 0 ? (
              <span className="library-muted-copy">Uncategorized</span>
            ) : (
              asset.virtualFolders.map(folder => (
                <span key={folder.id} className="library-pill">
                  {folder.fullPath}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="library-viewer__section">
          <div className="app-kicker">Tags</div>
          <div className="library-pill-list">
            {asset.tags.length === 0 ? (
              <span className="library-muted-copy">No tags assigned.</span>
            ) : (
              asset.tags.map(tag => (
                <span key={tag.id} className="library-pill">
                  {tag.name}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="library-viewer__section">
          <div className="app-kicker">Related Records</div>
          <div className="library-list">
            {asset.relatedRecords.length === 0 ? (
              <div className="library-empty-copy">No records reference this asset yet.</div>
            ) : (
              asset.relatedRecords.map(record => (
                <button
                  key={record.id}
                  type="button"
                  className="library-list__item"
                  onClick={() => {
                    onOpenRecord(record.id, record.title || record.stepName || 'Record Detail');
                  }}
                >
                  <strong>{record.title || record.stepName || 'Untitled Record'}</strong>
                  <span>{formatDateTime(record.updatedAt)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

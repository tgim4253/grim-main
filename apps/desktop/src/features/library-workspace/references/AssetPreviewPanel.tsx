import { Icon } from '../../../shared/ui/icon/Icon';
import { IconButton } from '../../../shared/ui/icon-button/IconButton';
import { ImagePlaceholder } from '../common/ImagePlaceholder';
import type { ConnectedImageItem, ReferenceAsset, ReferenceFolderItem } from './types';

type AssetPreviewPanelProps = {
  asset: ReferenceAsset;
  busy?: boolean;
  onClose?: () => void;
  onAddFolder?: (assetId: string) => void;
  onRemoveFolder?: (assetId: string, folderId: string) => void;
  onStartCroquis?: (assetId: string) => void;
};

type PreviewMetadataFieldProps = {
  label: string;
  value: string;
};

function PreviewSectionHeading({ children }: { children: string }) {
  return (
    <div className="asset-preview-panel__section-heading">
      <span className="asset-preview-panel__section-marker" aria-hidden />
      <h3>{children}</h3>
    </div>
  );
}

function PreviewMetadataField({ label, value }: PreviewMetadataFieldProps) {
  return (
    <div className="asset-preview-panel__metadata-field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function FolderPathRow({
  folder,
  removable = true,
  busy = false,
  onRemove,
}: {
  folder: ReferenceFolderItem;
  removable?: boolean;
  busy?: boolean;
  onRemove?: (folderId: string) => void;
}) {
  return (
    <div className="asset-preview-panel__folder-row">
      <Icon name="folder" size="xs" hierarchy="tertiary" aria-hidden />
      <span>{folder.path}</span>
      {removable ? (
        <button
          type="button"
          className="asset-preview-panel__folder-remove"
          aria-label={`Remove ${folder.path}`}
          disabled={busy}
          onClick={() => {
            onRemove?.(folder.id);
          }}
        >
          <Icon name="close" size="xs" hierarchy="tertiary" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

function ConnectedImageThumb({
  image,
  busy = false,
  onAdd,
}: {
  image: ConnectedImageItem;
  busy?: boolean;
  onAdd?: () => void;
}) {
  if (image.tone === 'add') {
    return (
      <button
        type="button"
        className="asset-preview-panel__related-add"
        aria-label="Start croquis with this asset"
        disabled={busy}
        onClick={onAdd}
      >
        <Icon name="plus" size="xs" hierarchy="tertiary" aria-hidden />
      </button>
    );
  }

  return (
    <div
      data-active={image.active ? 'true' : undefined}
      className="asset-preview-panel__related-thumb"
    >
      <ImagePlaceholder
        state={image.active ? 'active' : 'default'}
        className="asset-preview-panel__related-image"
      />
    </div>
  );
}

export function AssetPreviewPanel({
  asset,
  busy = false,
  onClose,
  onAddFolder,
  onRemoveFolder,
  onStartCroquis,
}: AssetPreviewPanelProps) {
  const previewSrc = asset.imageSrc ?? asset.thumbnailSrc;
  const folderItems = asset.folderItems ?? asset.folders.map(path => ({ id: path, path }));

  return (
    <aside className="asset-preview-panel" aria-label="Asset preview">
      <header className="asset-preview-panel__header">
        <h2>Asset Preview</h2>
        <IconButton icon="close" size="sm" aria-label="Close asset preview" onClick={onClose} />
      </header>

      <div className="asset-preview-panel__content">
        <div className="asset-preview-panel__preview-frame">
          {previewSrc ? (
            <img
              src={previewSrc}
              alt={asset.title}
              className="asset-preview-panel__preview-image asset-preview-panel__preview-asset-image"
              draggable={false}
            />
          ) : (
            <ImagePlaceholder ratio={asset.ratio} className="asset-preview-panel__preview-image" />
          )}
        </div>

        <div className="asset-preview-panel__sections">
          <section className="asset-preview-panel__section">
            <PreviewSectionHeading>Metadata</PreviewSectionHeading>
            <dl className="asset-preview-panel__metadata-grid">
              <PreviewMetadataField label="Resolution" value={asset.metadata.resolution} />
              <PreviewMetadataField label="Added" value={asset.metadata.addedAt} />
              <PreviewMetadataField
                label="Last Croquis Date"
                value={asset.metadata.lastCroquisAt}
              />
            </dl>
          </section>

          <section className="asset-preview-panel__section">
            <PreviewSectionHeading>Folders</PreviewSectionHeading>
            <div className="asset-preview-panel__folder-list">
              {folderItems.length > 0 ? (
                folderItems.map(folder => (
                  <FolderPathRow
                    key={folder.id}
                    folder={folder}
                    busy={busy}
                    onRemove={folderId => {
                      onRemoveFolder?.(asset.id, folderId);
                    }}
                  />
                ))
              ) : (
                <FolderPathRow
                  folder={{ id: 'unassigned', path: 'Unassigned' }}
                  removable={false}
                />
              )}
              <button
                type="button"
                className="asset-preview-panel__add-folder"
                disabled={busy}
                onClick={() => {
                  onAddFolder?.(asset.id);
                }}
              >
                + Add Folder
              </button>
            </div>
          </section>

          <section className="asset-preview-panel__section asset-preview-panel__section--related">
            <div className="asset-preview-panel__related-header">
              <h3>{asset.croquisResult.label}</h3>
              <span>{asset.croquisResult.status}</span>
            </div>
            <div className="asset-preview-panel__related-row">
              {asset.croquisResult.connectedImages.map(image => (
                <ConnectedImageThumb
                  key={image.id}
                  image={image}
                  busy={busy}
                  onAdd={() => {
                    onStartCroquis?.(asset.id);
                  }}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}

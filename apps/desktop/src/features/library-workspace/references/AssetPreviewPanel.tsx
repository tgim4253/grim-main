import { Icon } from '../../../shared/ui/icon/Icon';
import { IconButton } from '../../../shared/ui/icon-button/IconButton';
import { ImagePlaceholder } from '../common/ImagePlaceholder';
import type { ConnectedImageItem, ReferenceAsset } from './types';

type AssetPreviewPanelProps = {
  asset: ReferenceAsset;
  onClose?: () => void;
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

function FolderPathRow({ path }: { path: string }) {
  return (
    <div className="asset-preview-panel__folder-row">
      <Icon name="folder" size="xs" hierarchy="tertiary" aria-hidden />
      <span>{path}</span>
      <Icon name="close" size="xs" hierarchy="tertiary" aria-hidden />
    </div>
  );
}

function ConnectedImageThumb({ image }: { image: ConnectedImageItem }) {
  if (image.tone === 'add') {
    return (
      <button type="button" className="asset-preview-panel__related-add" aria-label="Add image">
        <Icon name="plus" size="xs" hierarchy="tertiary" aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label="Connected image"
      data-active={image.active ? 'true' : undefined}
      className="asset-preview-panel__related-thumb"
    >
      <ImagePlaceholder
        state={image.active ? 'active' : 'default'}
        className="asset-preview-panel__related-image"
      />
    </button>
  );
}

export function AssetPreviewPanel({ asset, onClose }: AssetPreviewPanelProps) {
  return (
    <aside className="asset-preview-panel" aria-label="Asset preview">
      <header className="asset-preview-panel__header">
        <h2>Asset Preview</h2>
        <IconButton icon="close" size="sm" aria-label="Close asset preview" onClick={onClose} />
      </header>

      <div className="asset-preview-panel__content">
        <div className="asset-preview-panel__preview-frame">
          <ImagePlaceholder ratio={asset.ratio} className="asset-preview-panel__preview-image" />
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
              {asset.folders.map(path => (
                <FolderPathRow key={path} path={path} />
              ))}
              <button type="button" className="asset-preview-panel__add-folder">
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
                <ConnectedImageThumb key={image.id} image={image} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}

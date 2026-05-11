import { useTranslation } from 'react-i18next';
import { Icon } from '../../../shared/ui/icon/Icon';
import { PreviewPanel } from '../../../shared/ui/preview-panel/PreviewPanel';
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
  const { t } = useTranslation('common');

  return (
    <div className="asset-preview-panel__folder-row">
      <Icon name="folder" size="xs" hierarchy="tertiary" aria-hidden />
      <span>{folder.path}</span>
      {removable ? (
        <button
          type="button"
          className="asset-preview-panel__folder-remove"
          aria-label={t('common.remove_label', {
            label: folder.path,
            defaultValue: 'Remove {{label}}',
          })}
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
  const { t } = useTranslation('common');

  if (image.tone === 'add') {
    return (
      <button
        type="button"
        className="asset-preview-panel__related-add"
        aria-label={t('references.start_croquis_with_asset', {
          defaultValue: 'Start croquis with this asset',
        })}
        disabled={busy}
        onClick={onAdd}
      >
        <Icon name="plus" size="xs" hierarchy="tertiary" aria-hidden />
      </button>
    );
  }

  const imageSrc = image.thumbnailSrc ?? image.imageSrc;

  return (
    <div
      data-active={image.active ? 'true' : undefined}
      className="asset-preview-panel__related-thumb"
      title={image.title}
    >
      {imageSrc ? (
        <img src={imageSrc} alt="" draggable={false} className="asset-preview-panel__related-img" />
      ) : (
        <ImagePlaceholder
          state={image.active ? 'active' : 'default'}
          className="asset-preview-panel__related-image"
        />
      )}
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
  const { t } = useTranslation('common');
  const previewSrc = asset.imageSrc ?? asset.thumbnailSrc;
  const folderItems = asset.folderItems ?? asset.folders.map(path => ({ id: path, path }));

  return (
    <PreviewPanel
      title={t('references.preview.title', { defaultValue: 'Asset Preview' })}
      ariaLabel={t('references.preview.aria_label', { defaultValue: 'Asset preview' })}
      className="asset-preview-panel"
      onClose={onClose}
    >
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
          <PreviewSectionHeading>
            {t('common.metadata', { defaultValue: 'Metadata' })}
          </PreviewSectionHeading>
          <dl className="asset-preview-panel__metadata-grid">
            <PreviewMetadataField
              label={t('references.resolution', { defaultValue: 'Resolution' })}
              value={asset.metadata.resolution}
            />
            <PreviewMetadataField
              label={t('references.added', { defaultValue: 'Added' })}
              value={asset.metadata.addedAt}
            />
            <PreviewMetadataField
              label={t('references.last_croquis_date', { defaultValue: 'Last Croquis Date' })}
              value={asset.metadata.lastCroquisAt}
            />
          </dl>
        </section>

        <section className="asset-preview-panel__section">
          <PreviewSectionHeading>
            {t('explorer.folders', { defaultValue: 'Folders' })}
          </PreviewSectionHeading>
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
                folder={{
                  id: 'unassigned',
                  path: t('references.unassigned', { defaultValue: 'Unassigned' }),
                }}
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
              {t('references.add_folder', { defaultValue: '+ Add Folder' })}
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
    </PreviewPanel>
  );
}

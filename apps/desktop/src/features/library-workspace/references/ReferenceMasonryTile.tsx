import type { CSSProperties } from 'react';
import { cx } from '../../../shared/lib/cx';
import { ImagePlaceholder } from '../common/ImagePlaceholder';
import type { LibraryWorkspaceLayout } from '../common/types';
import type { ReferenceAsset } from './types';

const GRID_TILE_HEIGHT = 280;

type ReferenceMasonryTileProps = {
  asset: ReferenceAsset;
  layout: LibraryWorkspaceLayout;
  selected: boolean;
  selectionIndex?: number;
  selectionMode?: boolean;
  onSelect: () => void;
};

export function ReferenceMasonryTile({
  asset,
  layout,
  selected,
  selectionIndex,
  selectionMode = false,
  onSelect,
}: ReferenceMasonryTileProps) {
  const style = {
    '--masonry-tile-height': `${String(layout === 'grid' ? GRID_TILE_HEIGHT : asset.height)}px`,
  } as CSSProperties;
  const imageSrc = asset.thumbnailSrc ?? asset.imageSrc;

  return (
    <button
      type="button"
      aria-label={asset.title}
      aria-pressed={selected}
      data-selected={selected ? 'true' : undefined}
      data-selection-mode={selectionMode ? 'true' : undefined}
      className={cx(
        'reference-masonry-tile',
        selected && 'reference-masonry-tile--selected',
        selectionMode && 'reference-masonry-tile--selectable',
      )}
      style={style}
      onClick={onSelect}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          draggable={false}
          className="reference-masonry-tile__asset-image"
        />
      ) : (
        <ImagePlaceholder
          ratio={asset.ratio}
          state={selected ? 'active' : 'default'}
          className="reference-masonry-tile__image"
        />
      )}
      {selectionMode ? (
        <span
          className={cx(
            'reference-masonry-tile__selection-control',
            selected && 'reference-masonry-tile__selection-control--selected',
          )}
          aria-hidden="true"
        >
          <span className="reference-masonry-tile__selection-box" />
          {selected && selectionIndex ? (
            <span className="reference-masonry-tile__selection-index">{selectionIndex}</span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

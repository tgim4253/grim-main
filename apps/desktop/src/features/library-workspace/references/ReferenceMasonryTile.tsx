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
  onSelect: () => void;
};

export function ReferenceMasonryTile({
  asset,
  layout,
  selected,
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
      className={cx('reference-masonry-tile', selected && 'reference-masonry-tile--selected')}
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
    </button>
  );
}

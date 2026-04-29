import type { CSSProperties } from 'react';
import { cx } from '../../../shared/lib/cx';
import { ImagePlaceholder } from '../common/ImagePlaceholder';
import type { LibraryWorkspaceLayout } from '../common/types';
import type { RecordResultItem } from './types';

const GRID_TILE_HEIGHT = 280;

type RecordResultTileProps = {
  record: RecordResultItem;
  layout: LibraryWorkspaceLayout;
  selected: boolean;
  selectionIndex?: number;
  selectionMode?: boolean;
  onSelect: () => void;
};

export function RecordResultTile({
  record,
  layout,
  selected,
  selectionIndex,
  selectionMode = false,
  onSelect,
}: RecordResultTileProps) {
  const style = {
    '--record-result-tile-height': `${String(
      layout === 'grid' ? GRID_TILE_HEIGHT : record.height,
    )}px`,
  } as CSSProperties;
  const imageSrc = record.thumbnailSrc ?? record.imageSrc;

  return (
    <button
      type="button"
      aria-label={record.title || 'Croquis record'}
      aria-pressed={selected}
      data-selected={selected ? 'true' : undefined}
      data-selection-mode={selectionMode ? 'true' : undefined}
      className={cx(
        'record-result-tile',
        selected && 'record-result-tile--selected',
        selectionMode && 'record-result-tile--selectable',
      )}
      style={style}
      onClick={onSelect}
    >
      {imageSrc ? (
        <img src={imageSrc} alt="" draggable={false} className="record-result-tile__image" />
      ) : (
        <ImagePlaceholder
          ratio={record.ratio}
          state={selected ? 'active' : 'default'}
          className="record-result-tile__placeholder"
        />
      )}
      {selectionMode ? (
        <span
          className={cx(
            'record-result-tile__selection-control',
            selected && 'record-result-tile__selection-control--selected',
          )}
          aria-hidden="true"
        >
          <span className="record-result-tile__selection-box" />
          {selected && selectionIndex ? (
            <span className="record-result-tile__selection-index">{selectionIndex}</span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}

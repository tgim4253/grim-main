import { ImageItem, Size } from '@tgim/types/grid';
import { useMemo } from 'react';
import ThumbCard from './ThumbCard';

interface Props {
  images: ImageItem[];
  onItemClick: (event: React.MouseEvent, img: ImageItem) => void;
  selectMode: boolean;
  observe: (el: Element | null, key: string) => void;
  unobserve: (el: Element | null) => void;
  thumbSize: number;
  isSelected: (id: string) => boolean;
  columnCount: number;
}
export const MASONRY_CONFIG: Record<Size, { idealWidth: number; maxColumns: number }> = {
  small: { idealWidth: 160, maxColumns: 8 },
  medium: { idealWidth: 256, maxColumns: 6 },
  large: { idealWidth: 320, maxColumns: 4 },
};
export const MASONRY_COLUMN_GAP = 16;

/* ---------------------------------------------
 * Masonry layout via CSS columns
 * - Receives computed column counts to stay in sync with thumbnail sizing
 * - Works with IO-based visibility for thumbnail fetches
 * --------------------------------------------- */

export const MasonryLayout: React.FC<Props> = ({
  images,
  onItemClick,
  selectMode,
  observe,
  unobserve,
  thumbSize,
  isSelected,
  columnCount,
}) => {
  const columnStyle = useMemo<React.CSSProperties>(
    () => ({
      columnCount: Math.max(columnCount, 1),
      columnGap: `${String(MASONRY_COLUMN_GAP)}px`,
      columnFill: 'balance',
    }),
    [columnCount],
  );

  return (
    <div className="w-full" style={columnStyle}>
      {images.map((img: ImageItem) => (
        <div
          key={img.id}
          className="mb-4 inline-block w-full align-top"
          style={{ breakInside: 'avoid' }}
        >
          <ThumbCard
            img={img}
            onClick={onItemClick}
            showCheckbox={selectMode}
            layout="masonry"
            observe={observe}
            unobserve={unobserve}
            thumbSize={thumbSize}
            selected={isSelected(img.hash)}
          />
        </div>
      ))}
    </div>
  );
};

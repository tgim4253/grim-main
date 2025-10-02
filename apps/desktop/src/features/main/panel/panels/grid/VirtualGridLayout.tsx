import { ImageItem, Size } from '@tgim/types/grid';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeGrid as WindowGrid, GridChildComponentProps } from 'react-window';
import ThumbCard from './ThumbCard';
import { useElementSize } from '@tgim/hooks/useElementSize';

interface Props {
  images: ImageItem[];
  size: Size;
  onItemClick: (event: React.MouseEvent, img: ImageItem) => void;
  observe: (el: Element | null, key: string) => void;
  unobserve: (el: Element | null) => void;
  selectMode: boolean;
  thumbSize: number;
  onNeedThumbs: (items: ImageItem[]) => void;
  isSelected: (id: string) => boolean;
}

type GridCellData = {
  images: ImageItem[];
  cols: number;
  itemW: number;
  itemH: number;
  gap: number;
  onItemClick: (event: React.MouseEvent, img: ImageItem) => void;
  selectMode: boolean;
  observe: (el: Element | null, key: string) => void;
  unobserve: (el: Element | null) => void;
  thumbSize: number;
  isSelected: (id: string) => boolean;
};
/* ---------------------------------------------
 * Virtualized Grid (react-window)
 * --------------------------------------------- */

export const VirtualGridLayout: React.FC<Props> = ({
  images,
  size,
  onItemClick,
  observe, // no-op in grid path
  unobserve, // no-op in grid path
  selectMode,
  thumbSize,
  onNeedThumbs,
  isSelected,
}) => {
  const itemW = size === 'small' ? 96 : size === 'large' ? 192 : 144;
  const itemH = itemW;
  const gap = 16;
  const containerRef = useRef<HTMLDivElement>(null);

  //@ts-expect-error.
  const { width, height } = useElementSize(containerRef);

  const cols = Math.max(1, Math.floor((width + gap) / (itemW + gap)));
  const rowCount = Math.ceil(images.length / cols);
  const rowsInView = height > 0 ? height / (itemH + gap) : 0;
  // ▶ Wider pre-render: about 1.5x viewport worth of rows
  const overscanRowCount = rowsInView > 0 ? Math.max(2, Math.ceil(rowsInView * 1.5)) : 4;

  // Request thumbs for rows/cols in overscan range (debounced via RAF) with extra buffer
  const rafRef = useRef<number | null>(null);
  const pendingRangeRef = useRef<{ rs: number; re: number } | null>(null);

  const scheduleFetchForRange = useCallback(
    (rs: number, re: number) => {
      // Merge with pending range to reduce calls, and expand with buffer rows
      const EXTRA = 3; // prefetch additional rows beyond overscan
      rs = Math.max(0, rs - EXTRA);
      re = re + EXTRA;

      if (!pendingRangeRef.current) {
        pendingRangeRef.current = { rs, re };
      } else {
        pendingRangeRef.current = {
          rs: Math.min(pendingRangeRef.current.rs, rs),
          re: Math.max(pendingRangeRef.current.re, re),
        };
      }
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        const r = pendingRangeRef.current;
        rafRef.current = null;
        pendingRangeRef.current = null;
        if (!r) return;
        const startIdx = r.rs * cols;
        const endIdxExclusive = Math.min(images.length, (r.re + 1) * cols);
        const slice = images.slice(startIdx, endIdxExclusive);
        onNeedThumbs(slice);
      });
    },
    [cols, images, onNeedThumbs],
  );

  const cellData = useMemo<GridCellData>(
    () => ({
      images,
      cols,
      itemW,
      itemH,
      gap,
      onItemClick,
      selectMode,
      observe,
      unobserve,
      thumbSize,
      isSelected,
    }),
    [
      images,
      cols,
      itemW,
      itemH,
      gap,
      onItemClick,
      selectMode,
      observe,
      unobserve,
      thumbSize,
      isSelected,
    ],
  );

  // Stable key to prevent remount flicker when layout/size changes
  const itemKey = useCallback(
    ({
      columnIndex,
      rowIndex,
      data,
    }: {
      columnIndex: number;
      rowIndex: number;
      data: GridCellData;
    }) => {
      const idx = rowIndex * data.cols + columnIndex;
      return data.images[idx]?.hash ?? `row${String(rowIndex)}-col${String(columnIndex)}`;
    },
    [],
  );

  const Cell = useCallback(
    ({
      columnIndex,
      rowIndex,
      style,
      data,
      isScrolling,
    }: GridChildComponentProps<GridCellData>) => {
      const idx = rowIndex * data.cols + columnIndex;
      if (idx >= data.images.length) return null;
      const img = data.images[idx];
      return (
        <div
          style={{
            ...style,
            left: (style.left as number) + data.gap,
            top: (style.top as number) + data.gap,
            width: data.itemW,
            height: data.itemH,
          }}
        >
          <ThumbCard
            img={img}
            onClick={data.onItemClick}
            showCheckbox={data.selectMode}
            layout="grid"
            observe={data.observe}
            unobserve={data.unobserve}
            thumbSize={data.thumbSize}
            selected={data.isSelected(img.hash)}
            isScrolling={!!isScrolling}
          />
        </div>
      );
    },
    [],
  );

  return (
    <div ref={containerRef} className="w-full h-full">
      {width > 0 && height > 0 && (
        <WindowGrid
          columnCount={cols}
          columnWidth={itemW + gap}
          height={height}
          rowCount={rowCount}
          rowHeight={itemH + gap}
          width={width}
          itemData={cellData}
          overscanColumnCount={2}
          overscanRowCount={overscanRowCount}
          useIsScrolling
          itemKey={itemKey}
          onItemsRendered={({ overscanRowStartIndex, overscanRowStopIndex }) => {
            // Proactively fetch thumbnails for overscanned rows (with buffer)
            scheduleFetchForRange(overscanRowStartIndex, overscanRowStopIndex);
          }}
        >
          {Cell}
        </WindowGrid>
      )}
    </div>
  );
};

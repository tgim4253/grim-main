import { listen } from '@tauri-apps/api/event';
import { useMoa } from '@tgim/hooks/useMoa';
import { useMultiSelect } from '@tgim/dnd/index';
import { GridData, ImageItem } from '@tgim/types/grid';
import { ipc } from '../../../../lib/ipc';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import useThumbStore, { convertToThumbKey } from '@tgim/stores/thumbStore';
import { ResizeMode } from '@tgim/types/file';
import { useShallow } from 'zustand/shallow';
import { convertFileSrc } from '@tauri-apps/api/core';
import Masonry from 'react-masonry-css';
import { FixedSizeGrid as WindowGrid, GridChildComponentProps } from 'react-window';
import { Button } from '@tgim/ui';

/* ---------------------------------------------
 * Helper Icon Components (unchanged)
 * --------------------------------------------- */
const GridIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect width="7" height="7" x="3" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" />
    <rect width="7" height="7" x="3" y="14" rx="1" />
  </svg>
);

const MasonryIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect width="7" height="12" x="3" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" />
    <rect width="7" height="3" x="3" y="19" rx="1" />
  </svg>
);

/* ---------------------------------------------
 * Types, Constants, Hooks (unchanged)
 * --------------------------------------------- */

interface Props {
  gridData: GridData;
}

type Size = 'small' | 'medium' | 'large';
type Layout = 'grid' | 'masonry';

const SIZES: Size[] = ['small', 'medium', 'large'];
const LAYOUTS: Layout[] = ['grid', 'masonry'];
const MAX_ITEMS_PER_REQ = 100;
const INITIAL_FETCH_COUNT = 50;

// Debounce Hook (unchanged)
function useDebouncedEffect(fn: () => void, deps: React.DependencyList, delay: number) {
  useEffect(() => {
    const handler = setTimeout(() => fn(), delay);
    return () => clearTimeout(handler);
  }, [fn, ...deps]);
}

// Visibility Hook (unchanged)
function useVisibilityMap(rootRef: React.RefObject<HTMLElement>, overscanPx = 600) {
  const ioRef = useRef<IntersectionObserver | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const pending = useRef<Record<string, boolean>>({});
  const rafId = useRef<number | null>(null);

  const flush = useCallback(() => {
    setVisible(prev => {
      if (Object.keys(pending.current).length === 0) return prev;
      const next = { ...prev, ...pending.current };
      pending.current = {};
      return next;
    });
    rafId.current = null;
  }, []);

  const ensureObserver = useCallback(() => {
    if (ioRef.current) return ioRef.current;
    ioRef.current = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const k = (entry.target as HTMLElement).dataset.k;
          if (!k) continue;
          pending.current[k] = entry.isIntersecting;
        }
        if (rafId.current == null) {
          rafId.current = requestAnimationFrame(flush);
        }
      },
      {
        root: rootRef.current ?? null,
        rootMargin: `${overscanPx}px 0px`,
        threshold: 0,
      },
    );
    return ioRef.current;
  }, [flush, overscanPx, rootRef]);

  const observe = useCallback(
    (el: Element | null, key: string) => {
      if (!el) return;
      (el as HTMLElement).dataset.k = key;
      ensureObserver().observe(el);
    },
    [ensureObserver],
  );

  const unobserve = useCallback((el: Element | null) => {
    if (!el || !ioRef.current) return;
    ioRef.current.unobserve(el);
  }, []);

  useEffect(() => {
    return () => {
      if (ioRef.current) ioRef.current.disconnect();
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return { visible, observe, unobserve };
}

// Element Size Hook (unchanged)
function useElementSize<T extends HTMLElement>(ref: React.RefObject<T>) {
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const cr = entries[0].contentRect;
      setSize({ width: cr.width, height: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/* ---------------------------------------------
 * Main Component
 * --------------------------------------------- */
const GridView: React.FC<Props> = ({ gridData }) => {
  const { moaId } = useMoa(location);
  const [layout, setLayout] = useState<Layout>('grid');
  const [size, setSize] = useState<Size>('medium');
  const [selectMode, setSelectMode] = useState(false);
  const [images] = useState(gridData.images);

  const visibleOrder = useMemo(() => images.map(img => img.hash), [images]);

  const {
    selected,
    onItemClick: handleSelectionClick,
    clearSelection,
    isSelected,
  } = useMultiSelect(visibleOrder, {
    pruneOnVisibilityChange: true,
    keepSelectedOnClick: true,
  });

  // Map for quick lookup by hash
  const hashToImgMap = useMemo(() => {
    const map: Record<string, ImageItem> = {};
    images.forEach(img => (map[img.hash] = img));
    return map;
  }, [images]);

  const { upsertThumb } = useThumbStore(
    useShallow(state => ({
      upsertThumb: state.upsert,
    })),
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  // @ts-expect-error.
  const { visible, observe, unobserve } = useVisibilityMap(scrollRef, 800);

  const thumbSize = useMemo(() => {
    switch (size) {
      case 'small':
        return 96;
      case 'large':
        return 256;
      default:
        return 128;
    }
  }, [size]);

  /* -------------------------------------------------
   * Thumbnail fetcher
   * NOTE: Prevent duplicate work by checking store.
   * ------------------------------------------------- */
  const fetchThumbnails = useCallback(
    async (itemsToFetch: ImageItem[]) => {
      if (moaId === null || itemsToFetch.length === 0) return;

      const currentThumbs = useThumbStore.getState().byKey;

      const toRequest = itemsToFetch
        .map(img => {
          const key = convertToThumbKey(img.hash, {
            width: thumbSize,
            height: thumbSize,
            dpr: 1,
            mode: ResizeMode.Original,
          });
          // Skip if already ready
          if (currentThumbs[key]?.status === 'ready') return null;
          return {
            xxhs: img.hash,
            specs: [
              { width: thumbSize, height: thumbSize, dpr: 1, mode: ResizeMode.Original, key },
            ],
          };
        })
        .filter(Boolean) as any[];

      if (toRequest.length === 0) return;

      for (let i = 0; i < toRequest.length; i += MAX_ITEMS_PER_REQ) {
        const chunk = toRequest.slice(i, i + MAX_ITEMS_PER_REQ);
        try {
          const responses = await ipc.file.getThumbnails(moaId, { items: chunk });
          responses.items.forEach((item: any) => {
            item.specs.forEach((spec: any) => {
              upsertThumb(spec.thumb_key ?? spec.key, {
                status: spec.status === 'hit' ? 'ready' : 'pending',
                url: spec.status === 'hit' ? spec.url : undefined,
                updatedAt: Date.now(),
              });
            });
          });
        } catch (error) {
          console.error('Failed to fetch thumbnails:', error);
        }
      }
    },
    [moaId, thumbSize, upsertThumb],
  );

  // Stable ref to avoid stale closure
  const stableFetchThumbnails = useRef(fetchThumbnails);
  useEffect(() => {
    stableFetchThumbnails.current = fetchThumbnails;
  }, [fetchThumbnails]);

  // Initial warm-up
  useEffect(() => {
    const initialItems = images.slice(0, INITIAL_FETCH_COUNT);
    stableFetchThumbnails.current(initialItems);
  }, [images]);

  /* -------------------------------------------------
   * Fetch for Masonry via IntersectionObserver
   * (Grid uses react-window onItemsRendered; see below)
   * ------------------------------------------------- */
  const visibleItems = useMemo(() => {
    return Object.keys(visible)
      .filter(k => visible[k])
      .map(hash => hashToImgMap[hash])
      .filter(Boolean);
  }, [visible, hashToImgMap]);

  useDebouncedEffect(
    () => {
      if (layout === 'masonry' && visibleItems.length > 0) {
        stableFetchThumbnails.current(visibleItems);
      }
    },
    [visibleItems, layout],
    120,
  );

  // Handler for grid layout to request thumbs by index ranges
  const handleNeedThumbs = useCallback((items: ImageItem[]) => {
    if (items.length) stableFetchThumbnails.current(items);
  }, []);

  const gridItemSizeClass = useMemo(() => {
    if (layout === 'masonry') {
      switch (size) {
        case 'small':
          return 'w-40';
        case 'large':
          return 'w-80';
        default:
          return 'w-64';
      }
    }
    return '';
  }, [size, layout]);

  const selectedCount = selected.size;

  const handleToggleSelectMode = useCallback(() => {
    setSelectMode(prev => {
      if (prev) {
        clearSelection();
        return false;
      }
      return true;
    });
  }, [clearSelection]);

  const handleBackgroundClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleItemClick = useCallback(
    (event: React.MouseEvent, img: ImageItem) => {
      handleSelectionClick(event, img.hash);

      if (!selectMode) {
        console.log(img);
      }
    },
    [handleSelectionClick, selectMode],
  );

  return (
    <div className="flex flex-col w-full h-full bg-surface text-text font-sans">
      <div className="flex items-center justify-between flex-shrink-0 px-4 py-2 border-b border-border bg-surface-raised">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface-muted p-1 shadow-inner">
            {SIZES.map(s => (
              <Button key={s} variant="toggle" active={size === s} onClick={() => setSize(s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface-muted p-1 shadow-inner">
            {LAYOUTS.map(l => (
              <Button
                key={l}
                variant="icon"
                active={layout === l}
                onClick={() => setLayout(l)}
                aria-label={l === 'grid' ? 'Grid layout' : 'Masonry layout'}
                className="size-9"
              >
                {l === 'grid' ? <GridIcon /> : <MasonryIcon />}
              </Button>
            ))}
          </div>
        </div>
        <Button
          variant={selectMode ? 'primary' : 'secondary'}
          onClick={handleToggleSelectMode}
          aria-pressed={selectMode}
          className="min-w-[7rem] px-4 py-2 text-sm font-medium"
        >
          {selectMode && selectedCount ? `Done (${selectedCount})` : selectMode ? 'Done' : 'Select'}
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-4" onClick={handleBackgroundClick}>
        {layout === 'grid' ? (
          <VirtualGridLayout
            images={images}
            size={size}
            onItemClick={handleItemClick}
            // For grid we *don't* rely on IO to fetch; pass no-op to avoid overhead
            observe={() => {}}
            unobserve={() => {}}
            selectMode={selectMode}
            thumbSize={thumbSize}
            onNeedThumbs={handleNeedThumbs}
            isSelected={isSelected}
          />
        ) : (
          <MasonryLayout
            images={images}
            sizeClass={gridItemSizeClass}
            selectMode={selectMode}
            onItemClick={handleItemClick}
            observe={observe}
            unobserve={unobserve}
            thumbSize={thumbSize}
            isSelected={isSelected}
          />
        )}
      </div>
    </div>
  );
};

/* ---------------------------------------------
 * Virtualized Grid (react-window)
 *
 * IMPORTANT CHANGE:
 *  - Use react-window's onItemsRendered to proactively request thumbnails
 *    for the overscanned rows. This prevents "blank rows" on very fast scrolls
 *    where IntersectionObserver might miss transient intersections.
 * --------------------------------------------- */
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

function VirtualGridLayout({
  images,
  size,
  onItemClick,
  observe, // no-op in grid path
  unobserve, // no-op in grid path
  selectMode,
  thumbSize,
  onNeedThumbs,
  isSelected,
}: {
  images: ImageItem[];
  size: Size;
  onItemClick: (event: React.MouseEvent, img: ImageItem) => void;
  observe: (el: Element | null, key: string) => void;
  unobserve: (el: Element | null) => void;
  selectMode: boolean;
  thumbSize: number;
  onNeedThumbs: (items: ImageItem[]) => void;
  isSelected: (id: string) => boolean;
}) {
  const itemW = size === 'small' ? 96 : size === 'large' ? 192 : 144;
  const itemH = itemW;
  const gap = 16;
  const containerRef = useRef<HTMLDivElement>(null);

  // @ts-expect-error.
  const { width, height } = useElementSize(containerRef);

  const cols = Math.max(1, Math.floor((width + gap) / (itemW + gap)));
  const rowCount = Math.ceil(images.length / cols);

  // Request thumbs for rows/cols in overscan range (debounced via RAF)
  const rafRef = useRef<number | null>(null);
  const pendingRangeRef = useRef<{ rs: number; re: number } | null>(null);

  const scheduleFetchForRange = useCallback(
    (rs: number, re: number) => {
      // Merge with pending range to reduce calls
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

  const Cell = useCallback(
    ({ columnIndex, rowIndex, style, data }: GridChildComponentProps<GridCellData>) => {
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
          overscanRowCount={5} // ↑ a bit more generous overscan to hide fetch latency
          overscanColumnCount={1}
          onItemsRendered={({ overscanRowStartIndex, overscanRowStopIndex }) => {
            // Proactively fetch thumbnails for overscanned rows
            scheduleFetchForRange(overscanRowStartIndex, overscanRowStopIndex);
          }}
        >
          {Cell}
        </WindowGrid>
      )}
    </div>
  );
}

/* ---------------------------------------------
 * Non-virtual Masonry (unchanged behavior)
 * Uses IO-based visibility to decide fetches.
 * --------------------------------------------- */
function MasonryLayout({
  images,
  onItemClick,
  sizeClass,
  selectMode,
  observe,
  unobserve,
  thumbSize,
  isSelected,
}: {
  images: ImageItem[];
  onItemClick: (event: React.MouseEvent, img: ImageItem) => void;
  sizeClass: string;
  selectMode: boolean;
  observe: (el: Element | null, key: string) => void;
  unobserve: (el: Element | null) => void;
  thumbSize: number;
  isSelected: (id: string) => boolean;
}) {
  const breakpointColumnsObj = { default: 6, 1536: 6, 1280: 5, 1024: 4, 768: 3, 640: 2 };
  return (
    <Masonry
      breakpointCols={breakpointColumnsObj}
      className="flex w-auto -ml-4"
      columnClassName="pl-4 bg-clip-padding"
    >
      {images.map((img: ImageItem) => (
        <div key={img.id ?? img.hash} className="mb-4">
          <ThumbCard
            img={img}
            onClick={onItemClick}
            sizeClass={sizeClass}
            showCheckbox={selectMode}
            layout="masonry"
            observe={observe}
            unobserve={unobserve}
            thumbSize={thumbSize}
            selected={isSelected(img.hash)}
          />
        </div>
      ))}
    </Masonry>
  );
}

/* ---------------------------------------------
 * Thumb Card (memoized)
 * --------------------------------------------- */
type ThumbCardProps = {
  img: ImageItem;
  onClick: (event: React.MouseEvent, img: ImageItem) => void;
  showCheckbox: boolean;
  selected: boolean;
  layout: Layout;
  observe: (el: Element | null, key: string) => void;
  unobserve: (el: Element | null) => void;
  thumbSize: number;
  sizeClass?: string;
};

const ThumbCardComponent: React.FC<ThumbCardProps> = ({
  img,
  onClick,
  showCheckbox,
  selected,
  layout,
  observe,
  unobserve,
  sizeClass,
  thumbSize,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);

  const key = useMemo(
    () =>
      convertToThumbKey(img.hash, {
        width: thumbSize,
        height: thumbSize,
        dpr: 1,
        mode: ResizeMode.Original,
      }),
    [img.hash, thumbSize],
  );

  const { entry } = useThumbStore(useShallow(state => ({ entry: state.byKey[key] })));
  const [stableSrc, setStableSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (entry?.status === 'ready' && entry.url) {
      setStableSrc(convertFileSrc(entry.url));
    }
  }, [entry]);

  useEffect(() => {
    const el = containerRef.current;
    // Observe by hash to match visibility map keys
    observe(el, img.hash);
    return () => unobserve(el);
  }, [img.hash, observe, unobserve]);

  const handleImageLoad = useCallback(() => setLoaded(true), []);
  const handleCardClick = useCallback(
    (event: React.MouseEvent) => {
      onClick(event, img);
    },
    [onClick, img],
  );

  const selectionClasses = selected
    ? 'border-accent ring-2 ring-accent/60 ring-offset-1 ring-offset-surface-raised'
    : 'border-border';

  return (
    <div
      ref={containerRef}
      className={`group relative w-full h-full overflow-hidden rounded-lg border ${selectionClasses} bg-surface shadow-sm transition-all duration-200 hover:border-accent hover:shadow-lg hover:-translate-y-1 cursor-pointer ${sizeClass ?? ''}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      data-selected={selected ? 'true' : 'false'}
    >
      {showCheckbox && (
        <div className="absolute left-2 top-2 z-10">
          <input
            type="checkbox"
            className="w-4 h-4 rounded text-accent bg-surface-muted border-border focus:ring-accent"
            readOnly
            checked={selected}
          />
        </div>
      )}
      <div className="relative w-full h-full">
        {!stableSrc && <div className="w-full h-full bg-surface-muted animate-pulse" />}
        {stableSrc && (
          <img
            src={stableSrc}
            alt={img.name}
            className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={handleImageLoad}
            loading="lazy"
            decoding="async"
          />
        )}
      </div>
      {layout === 'grid' && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-[color-mix(in_srgb,var(--ds-overlay)_85%,transparent)] via-[color-mix(in_srgb,var(--ds-overlay)_35%,transparent)] to-transparent">
          <p className="text-text-inverse text-xs font-medium truncate" title={img.name}>
            {img.name}
          </p>
        </div>
      )}
      {layout === 'masonry' && (
        <div className="p-2 border-t border-border">
          <p className="text-text text-xs font-medium truncate" title={img.name}>
            {img.name}
          </p>
          <p className="text-xs text-text-soft opacity-80">{Math.round(img.size / 1024)} KB</p>
        </div>
      )}
    </div>
  );
};

const ThumbCard = React.memo(ThumbCardComponent);

export default GridView;

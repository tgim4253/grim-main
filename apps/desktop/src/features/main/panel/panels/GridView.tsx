import { useMoa } from '@tgim/hooks/useMoa';
import { GridData, ImageItem } from '@tgim/types/grid';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useThumb, type ThumbFetcher, type ThumbEventBus } from '@tgim/hooks/useThumb';
import { ResizeMode } from '@tgim/types/file';
import { convertFileSrc } from '@tauri-apps/api/core';
import Masonry from 'react-masonry-css';
import { FixedSizeGrid as WindowGrid } from 'react-window';
import { Button } from '@tgim/ui';
import { makeThumbFetcher, thumbEventBus } from '../../../../hooks/thumbs';

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

  // Map for quick lookup by hash
  const scrollRef = useRef<HTMLDivElement>(null);
  // @ts-expect-error.
  const { visible, observe, unobserve } = useVisibilityMap(scrollRef, 800);

  const [dpr] = useState(() =>
    typeof window !== 'undefined' ? Math.min(2, Math.round(window.devicePixelRatio || 1)) : 1,
  );
  const thumbFetcher = useMemo(() => makeThumbFetcher(moaId), [moaId]);

  const gridThumbSize = useMemo(() => {
    switch (size) {
      case 'small':
        return 96;
      case 'large':
        return 192;
      default:
        return 144;
    }
  }, [size]);

  const masonryThumbWidth = useMemo(() => {
    switch (size) {
      case 'small':
        return 160;
      case 'large':
        return 320;
      default:
        return 256;
    }
  }, [size]);

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

  const handleItemClick = useCallback((img: ImageItem) => {
    console.log(img);
  }, []);

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
          onClick={() => setSelectMode(v => !v)}
          aria-pressed={selectMode}
          className="min-w-[7rem] px-4 py-2 text-sm font-medium"
        >
          {selectMode ? 'Done' : 'Select'}
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-4">
        {layout === 'grid' ? (
          <VirtualGridLayout
            images={images}
            size={size}
            onItemClick={handleItemClick}
            // For grid we *don't* rely on IO to fetch; pass no-op to avoid overhead
            observe={() => {}}
            unobserve={() => {}}
            selectMode={selectMode}
            thumbSize={gridThumbSize}
            fetcher={thumbFetcher}
            dpr={dpr}
            eventBus={thumbEventBus}
          />
        ) : (
          <MasonryLayout
            images={images}
            sizeClass={gridItemSizeClass}
            selectMode={selectMode}
            onItemClick={handleItemClick}
            observe={observe}
            unobserve={unobserve}
            thumbSize={masonryThumbWidth}
            fetcher={thumbFetcher}
            dpr={dpr}
            visibleMap={visible}
            eventBus={thumbEventBus}
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
function VirtualGridLayout({
  images,
  size,
  onItemClick,
  observe, // no-op in grid path
  unobserve, // no-op in grid path
  selectMode,
  thumbSize,
  fetcher,
  dpr,
  eventBus,
}: {
  images: ImageItem[];
  size: Size;
  onItemClick: (img: ImageItem) => void;
  observe: (el: Element | null, key: string) => void;
  unobserve: (el: Element | null) => void;
  selectMode: boolean;
  thumbSize: number;
  fetcher: ThumbFetcher;
  dpr: number;
  eventBus: ThumbEventBus;
}) {
  const itemW = size === 'small' ? 96 : size === 'large' ? 192 : 144;
  const itemH = itemW;
  const gap = 16;
  const containerRef = useRef<HTMLDivElement>(null);

  // @ts-expect-error.
  const { width, height } = useElementSize(containerRef);

  const cols = Math.max(1, Math.floor((width + gap) / (itemW + gap)));
  const rowCount = Math.ceil(images.length / cols);

  const Cell = useCallback(
    ({ columnIndex, rowIndex, style }: any) => {
      const idx = rowIndex * cols + columnIndex;
      if (idx >= images.length) return null;
      const img = images[idx];
      return (
        <div
          style={{
            ...style,
            left: (style.left as number) + gap,
            top: (style.top as number) + gap,
            width: itemW,
            height: itemH,
          }}
        >
          <ThumbCard
            img={img}
            onClick={onItemClick}
            showCheckbox={selectMode}
            layout="grid"
            observe={observe}
            unobserve={unobserve}
            thumbSize={thumbSize}
            fetcher={fetcher}
            dpr={dpr}
            isVisible
            eventBus={eventBus}
          />
        </div>
      );
    },
    [
      cols,
      images,
      itemW,
      itemH,
      onItemClick,
      selectMode,
      observe,
      unobserve,
      gap,
      thumbSize,
      fetcher,
      dpr,
    ],
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
          overscanRowCount={5} // ↑ a bit more generous overscan to hide fetch latency
          overscanColumnCount={1}
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
  fetcher,
  dpr,
  visibleMap,
  eventBus,
}: {
  images: ImageItem[];
  onItemClick: (img: ImageItem) => void;
  sizeClass: string;
  selectMode: boolean;
  observe: (el: Element | null, key: string) => void;
  unobserve: (el: Element | null) => void;
  thumbSize: number;
  fetcher: ThumbFetcher;
  dpr: number;
  visibleMap: Record<string, boolean>;
  eventBus: ThumbEventBus;
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
            fetcher={fetcher}
            dpr={dpr}
            isVisible={!!visibleMap[img.hash]}
            eventBus={eventBus}
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
  onClick: (img: ImageItem) => void;
  showCheckbox: boolean;
  layout: Layout;
  observe: (el: Element | null, key: string) => void;
  unobserve: (el: Element | null) => void;
  thumbSize: number;
  sizeClass?: string;
  fetcher: ThumbFetcher;
  dpr: number;
  isVisible?: boolean;
  eventBus: ThumbEventBus;
};

const ThumbCardComponent: React.FC<ThumbCardProps> = ({
  img,
  onClick,
  showCheckbox,
  layout,
  observe,
  unobserve,
  sizeClass,
  thumbSize,
  fetcher,
  dpr,
  isVisible = false,
  eventBus,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const lastRequestRef = useRef(0);

  const spec = useMemo(
    () => ({
      width: thumbSize,
      height: layout === 'masonry' ? 0 : thumbSize,
      dpr,
      mode: ResizeMode.Original,
    }),
    [thumbSize, layout, dpr],
  );

  const { url, status, refetch } = useThumb(img.hash, spec, {
    fetcher,
    attach: true,
    retryOnError: true,
    autoFetch: layout !== 'masonry',
    eventBus,
  });

  const [stableSrc, setStableSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!url) {
      setStableSrc(undefined);
      setLoaded(false);
      return;
    }
    const resolved = url.startsWith('blob:') ? url : convertFileSrc(url);
    setStableSrc(resolved);
    setLoaded(false);
  }, [url]);

  useEffect(() => {
    if (layout !== 'masonry') {
      return undefined;
    }
    const el = containerRef.current;
    observe(el, img.hash);
    return () => unobserve(el);
  }, [layout, img.hash, observe, unobserve]);

  useEffect(() => {
    if (!isVisible) {
      lastRequestRef.current = 0;
    }
  }, [isVisible]);

  useEffect(() => {
    if (layout !== 'masonry') return;
    if (!isVisible) return;
    if (status === 'ready' || status === 'pending') return;

    const now = Date.now();
    if (now - lastRequestRef.current < 750) return;

    lastRequestRef.current = now;
    refetch();
  }, [layout, isVisible, status, refetch]);

  const handleImageLoad = useCallback(() => setLoaded(true), []);
  const handleCardClick = useCallback(() => onClick(img), [onClick, img]);

  const containerClasses = `group relative w-full ${
    layout === 'masonry' ? 'h-auto' : 'h-full'
  } overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition-all duration-200 hover:border-accent hover:shadow-lg hover:-translate-y-1 cursor-pointer ${
    sizeClass ?? ''
  }`;

  const imageWrapperClass = `relative w-full ${
    layout === 'masonry' ? 'h-auto min-h-[6rem]' : 'h-full'
  }`;

  const imageClass = `w-full ${
    layout === 'masonry' ? 'h-auto' : 'h-full'
  } object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`;

  const showPlaceholder = !stableSrc || !loaded;

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
    >
      {showCheckbox && (
        <div className="absolute left-2 top-2 z-10">
          <input
            type="checkbox"
            className="w-4 h-4 rounded text-accent bg-surface-muted border-border focus:ring-accent"
            readOnly
          />
        </div>
      )}
      <div className={imageWrapperClass}>
        {showPlaceholder && <div className="w-full h-full bg-surface-muted animate-pulse" />}
        {stableSrc && (
          <img
            src={stableSrc}
            alt={img.name}
            className={imageClass}
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

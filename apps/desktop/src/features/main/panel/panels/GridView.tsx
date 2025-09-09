import { listen } from '@tauri-apps/api/event';
import { useMoa } from '@tgim/hooks/useMoa';
import { GridData, ImageItem } from '@tgim/types/grid';
import { ipc } from '../../../../lib/ipc';
import React, { useEffect, useMemo, useRef, useState, useCallback, CSSProperties } from 'react';
import useThumbStore, { convertToThumbKey } from '@tgim/stores/thumbStore';
import { ResizeMode } from '@tgim/types/file';
import { useShallow } from 'zustand/shallow';
import { convertFileSrc } from '@tauri-apps/api/core';
import Masonry from 'react-masonry-css';
import { FixedSizeGrid as WindowGrid } from 'react-window';

/* ---------------------------------------------
 * Helper Icon Components (변경 없음)
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
 * Types, Constants, Hooks (변경 없음)
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

// Debounce Hook (변경 없음)
function useDebouncedEffect(fn: () => void, deps: React.DependencyList, delay: number) {
  useEffect(() => {
    const handler = setTimeout(() => fn(), delay);
    return () => clearTimeout(handler);
  }, [fn, ...deps]);
}

// Visibility Hook (변경 없음)
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

// Element Size Hook (변경 없음)
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

  const stableFetchThumbnails = useRef(fetchThumbnails);
  useEffect(() => {
    stableFetchThumbnails.current = fetchThumbnails;
  }, [fetchThumbnails]);

  useEffect(() => {
    const initialItems = images.slice(0, INITIAL_FETCH_COUNT);
    stableFetchThumbnails.current(initialItems);
  }, [images]);

  const visibleItems = useMemo(() => {
    return Object.keys(visible)
      .filter(k => visible[k])
      .map(hash => hashToImgMap[hash])
      .filter(Boolean);
  }, [visible, hashToImgMap]);

  useDebouncedEffect(
    () => {
      if (visibleItems.length > 0) {
        stableFetchThumbnails.current(visibleItems);
      }
    },
    [visibleItems],
    150,
  );

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
    <div className="w-full h-full flex flex-col bg-background-0 text-foreground font-sans">
      <div className="flex items-center justify-between px-4 py-2 border-b border-outline bg-background-1 flex-shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-background-2">
            {SIZES.map(s => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${size === s ? 'bg-accent text-white shadow-sm' : 'text-foreground/70 hover:bg-background-hover hover:text-foreground'}`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-background-2">
            {LAYOUTS.map(l => (
              <button
                key={l}
                onClick={() => setLayout(l)}
                className={`p-2 rounded-md transition-colors ${layout === l ? 'bg-accent text-white' : 'text-foreground/70 hover:bg-background-hover hover:text-foreground'}`}
              >
                {l === 'grid' ? <GridIcon /> : <MasonryIcon />}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setSelectMode(v => !v)}
          className={`px-4 py-2 text-sm rounded-lg border transition-colors ${selectMode ? 'bg-accent text-white border-accent' : 'bg-background-2 border-outline hover:bg-background-hover'}`}
        >
          {selectMode ? 'Done' : 'Select'}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-4">
        {layout === 'grid' ? (
          <VirtualGridLayout
            images={images}
            size={size}
            onItemClick={handleItemClick}
            observe={observe}
            unobserve={unobserve}
            selectMode={selectMode}
            thumbSize={thumbSize}
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
          />
        )}
      </div>
    </div>
  );
};

/* ---------------------------------------------
 * Virtualized Grid (react-window)
 * --------------------------------------------- */
function VirtualGridLayout({
  images,
  size,
  onItemClick,
  observe,
  unobserve,
  selectMode,
  thumbSize,
}: any) {
  const itemW = size === 'small' ? 96 : size === 'large' ? 192 : 144;
  const itemH = itemW;
  const gap = 16;
  const containerRef = useRef<HTMLDivElement>(null);
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
            left: style.left + gap,
            top: style.top + gap,
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
          />
        </div>
      );
    },
    [cols, images, itemW, itemH, onItemClick, selectMode, observe, unobserve, gap, thumbSize],
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
          overscanRowCount={3}
        >
          {Cell}
        </WindowGrid>
      )}
    </div>
  );
}

/* ---------------------------------------------
 * Non-virtual Masonry
 * --------------------------------------------- */
function MasonryLayout({
  images,
  onItemClick,
  sizeClass,
  selectMode,
  observe,
  unobserve,
  thumbSize,
}: any) {
  const breakpointColumnsObj = { default: 6, 1536: 6, 1280: 5, 1024: 4, 768: 3, 640: 2 };
  return (
    <Masonry
      breakpointCols={breakpointColumnsObj}
      className="flex w-auto -ml-4"
      columnClassName="pl-4 bg-clip-padding"
    >
      {images.map(img => (
        <div key={img.id} className="mb-4">
          <ThumbCard
            img={img}
            onClick={onItemClick}
            sizeClass={sizeClass}
            showCheckbox={selectMode}
            layout="masonry"
            observe={observe}
            unobserve={unobserve}
            thumbSize={thumbSize}
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
    observe(el, img.hash);
    return () => unobserve(el);
  }, [img.hash, observe, unobserve]);

  const handleImageLoad = useCallback(() => setLoaded(true), []);
  const handleCardClick = useCallback(() => onClick(img), [onClick, img]);

  return (
    <div
      ref={containerRef}
      className={`group relative w-full h-full overflow-hidden rounded-lg border border-outline bg-surface shadow-sm transition-all duration-200 hover:border-accent hover:shadow-lg hover:-translate-y-1 cursor-pointer ${sizeClass ?? ''}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
    >
      {showCheckbox && (
        <div className="absolute left-2 top-2 z-10">
          <input
            type="checkbox"
            className="w-4 h-4 rounded text-accent bg-background-2 border-outline focus:ring-accent"
            readOnly
          />
        </div>
      )}
      <div className="relative w-full h-full">
        {!stableSrc && <div className="w-full h-full animate-pulse bg-background-2" />}
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
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent">
          <p className="text-white text-xs font-medium truncate" title={img.name}>
            {img.name}
          </p>
        </div>
      )}
      {layout === 'masonry' && (
        <div className="p-2 border-t border-outline">
          <p className="text-foreground text-xs font-medium truncate" title={img.name}>
            {img.name}
          </p>
          <p className="text-foreground/60 text-xs">{Math.round(img.size / 1024)} KB</p>
        </div>
      )}
    </div>
  );
};

const ThumbCard = React.memo(ThumbCardComponent);

export default GridView;

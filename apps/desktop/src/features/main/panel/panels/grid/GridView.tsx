import { useMoa } from '@tgim/hooks/useMoa';
import { useMultiSelect } from '@tgim/dnd/index';
import { GridData, ImageItem, Layout, Size } from '@tgim/types/grid';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ResizeMode } from '@tgim/types/file';
import { useThumbnails } from '../../../../../hooks';
import { Button } from '@tgim/ui';
import { CroquisPreferences } from '@tgim/types/croquis';
import CroquisStartModal, {
  CroquisStartModalConfirmPayload,
} from '../../../../croquis/CroquisStartModal';
import { createDefaultCroquisPreferences } from '../../../../croquis/lib/preferences';
import ThumbnailStorageModal from '../../../../file/modal/ThumbnailStorageModal';
import { MASONRY_COLUMN_GAP, MASONRY_CONFIG, MasonryLayout } from './MarsonryLayout';
import { VirtualGridLayout } from './VirtualGridLayout';
import { useElementSize } from '@tgim/hooks/useElementSize';
import { Split } from '@tgim/ui/Splitter';
import FileDetailSidebar from '../FileDetailSidebar';
import { useDebouncedEffect } from '@tgim/hooks/useDebouncedEffect';

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
  onImageOpen?: (image: ImageItem) => void;
  onClearPreview?: () => void;
}

const SIZES: Size[] = ['small', 'medium', 'large'];
const LAYOUTS: Layout[] = ['grid', 'masonry'];

const SCROLL_CONTAINER_PADDING_X = 32;
const MAX_ITEMS_PER_REQ = 100;
const INITIAL_FETCH_COUNT = 50;

function calculateMasonryMetrics(containerWidth: number, size: Size) {
  const { idealWidth, maxColumns } = MASONRY_CONFIG[size];
  if (containerWidth <= 0) {
    return { columnCount: 1, cardWidth: idealWidth };
  }

  const desired = idealWidth + MASONRY_COLUMN_GAP;
  const available = containerWidth + MASONRY_COLUMN_GAP;
  const rawCount = Math.max(1, Math.floor(available / Math.max(desired, 1)));
  const columnCount = Math.min(rawCount, maxColumns);
  const totalGap = Math.max(columnCount - 1, 0) * MASONRY_COLUMN_GAP;
  const usableWidth = Math.max(containerWidth - totalGap, 1);
  const cardWidth = Math.max(Math.floor(usableWidth / columnCount), 1);

  return { columnCount, cardWidth };
}

// Visibility Hook (unchanged)
function useVisibilityMap<T extends HTMLElement>(
  rootRef: React.RefObject<T | null>,
  overscanPx = 600,
) {
  const ioRef = useRef<IntersectionObserver | null>(null);
  const observedElementsRef = useRef(new Map<string, Element>());
  const [visible, setVisible] = useState<Partial<Record<string, boolean>>>({});
  const pending = useRef<Partial<Record<string, boolean>>>({});
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

  const createObserver = useCallback(() => {
    return new IntersectionObserver(
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
        root: rootRef.current,
        rootMargin: `${String(overscanPx)}px 0px`,
        threshold: 0,
      },
    );
  }, [flush, overscanPx, rootRef]);

  const ensureObserver = useCallback(() => {
    if (ioRef.current) return ioRef.current;
    const observer = createObserver();
    observedElementsRef.current.forEach(element => {
      observer.observe(element);
    });
    ioRef.current = observer;
    return observer;
  }, [createObserver]);

  const observe = useCallback(
    (el: Element | null, key: string) => {
      if (!el) return;
      const element = el as HTMLElement;
      element.dataset.k = key;
      observedElementsRef.current.set(key, element);
      ensureObserver().observe(element);
    },
    [ensureObserver],
  );

  const unobserve = useCallback((el: Element | null) => {
    if (!el) return;
    const element = el as HTMLElement;
    const key = element.dataset.k;
    if (key) {
      observedElementsRef.current.delete(key);
    }
    if (ioRef.current) {
      ioRef.current.unobserve(element);
    }
  }, []);

  useEffect(() => {
    if (!ioRef.current) return;
    const prevObserver = ioRef.current;
    const nextObserver = createObserver();
    observedElementsRef.current.forEach(element => {
      nextObserver.observe(element);
    });
    ioRef.current = nextObserver;
    prevObserver.disconnect();
  }, [createObserver]);

  useEffect(() => {
    return () => {
      if (ioRef.current) ioRef.current.disconnect();
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
      observedElementsRef.current.clear();
    };
  }, []);

  return { visible, observe, unobserve };
}

export const GridContent: React.FC<Props> = ({ gridData, onImageOpen, onClearPreview }) => {
  const { moaId } = useMoa(location);
  const [layout, setLayout] = useState<Layout>('grid');
  const [size, setSize] = useState<Size>('medium');
  const [selectMode, setSelectMode] = useState(false);
  const [images, _setImages] = useState(gridData.images);

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
    const map: Partial<Record<string, ImageItem>> = {};
    images.forEach(img => (map[img.hash] = img));
    return map;
  }, [images]);

  const [croquisModalOpen, setCroquisModalOpen] = useState(false);
  const [croquisPreferences, setCroquisPreferences] = useState<CroquisPreferences>(() =>
    createDefaultCroquisPreferences(),
  );
  const [rememberCroquisOption, setRememberCroquisOption] = useState(true);
  const [storageModalOpen, setStorageModalOpen] = useState(false);

  const selectedCount = selected.size;
  const selectedHashes = useMemo(() => Array.from(selected), [selected]);

  const handleStartCroquis = useCallback(() => {
    if (selectedCount === 0) return;
    if (!moaId) {
      console.warn('Croquis start requested without a workspace id');
      return;
    }
    setCroquisModalOpen(true);
  }, [moaId, selectedCount]);

  const handleCroquisModalClose = useCallback(() => {
    setCroquisModalOpen(false);
  }, []);

  const handleStorageModalClose = useCallback(() => {
    setStorageModalOpen(false);
  }, []);

  const handleCroquisConfirm = useCallback(
    ({ preferences, remember }: CroquisStartModalConfirmPayload) => {
      setCroquisPreferences(preferences);
      setRememberCroquisOption(remember);
      clearSelection();
    },
    [clearSelection],
  );

  useEffect(() => {
    if (selectedCount === 0 && croquisModalOpen) {
      setCroquisModalOpen(false);
    }
  }, [croquisModalOpen, selectedCount]);

  const { ensureThumbnails } = useThumbnails({ moaId, maxBatchSize: MAX_ITEMS_PER_REQ });

  const scrollRef = useRef<HTMLDivElement>(null);

  const noop = React.useCallback((..._args: unknown[]) => {}, []);

  const viewportSize = useElementSize(scrollRef);
  const overscanPx = useMemo(
    () =>
      viewportSize.height > 0
        ? viewportSize.height * 0.25 // Observe ~25% extra above/below (~1.5× viewport)
        : 800,
    [viewportSize.height],
  );
  const { visible, observe, unobserve } = useVisibilityMap(scrollRef, overscanPx);

  const masonryMetrics = useMemo(() => {
    if (layout !== 'masonry') {
      return { columnCount: 1, cardWidth: MASONRY_CONFIG[size].idealWidth };
    }
    const containerWidth = Math.max(viewportSize.width - SCROLL_CONTAINER_PADDING_X, 0);
    return calculateMasonryMetrics(containerWidth, size);
  }, [layout, size, viewportSize.width]);

  const thumbSize = useMemo(() => {
    if (layout === 'masonry') {
      return masonryMetrics.cardWidth;
    }
    switch (size) {
      case 'small':
        return 96;
      case 'large':
        return 256;
      default:
        return 128;
    }
  }, [layout, masonryMetrics.cardWidth, size]);

  /* -------------------------------------------------
   * Thumbnail fetcher
   * NOTE: Prevent duplicate work by checking store.
   * ------------------------------------------------- */
  const fetchThumbnails = useCallback(
    async (itemsToFetch: ImageItem[]) => {
      if (itemsToFetch.length === 0) return;

      const requests = itemsToFetch.map(img => ({
        hash: img.hash,
        width: thumbSize,
        height: layout == 'masonry' ? 0 : thumbSize,
        dpr: 1 as const,
        mode: ResizeMode.Original,
      }));

      await ensureThumbnails(requests);
    },
    [ensureThumbnails, thumbSize, layout],
  );

  // Stable ref to avoid stale closure
  const stableFetchThumbnails = useRef(fetchThumbnails);
  useEffect(() => {
    stableFetchThumbnails.current = fetchThumbnails;
  }, [fetchThumbnails]);

  // Initial warm-up
  useEffect(() => {
    if (!moaId) {
      return;
    }

    const initialItems = images.slice(0, INITIAL_FETCH_COUNT);
    if (initialItems.length === 0) {
      return;
    }

    void stableFetchThumbnails.current(initialItems);
  }, [images, moaId]);

  /* -------------------------------------------------
   * Fetch for Masonry via IntersectionObserver
   * (Grid uses react-window onItemsRendered; see below)
   * ------------------------------------------------- */
  const visibleItems = useMemo(() => {
    return Object.keys(visible)
      .filter(k => visible[k])
      .map(hash => hashToImgMap[hash])
      .filter(e => e !== undefined);
  }, [visible, hashToImgMap]);

  useDebouncedEffect(
    () => {
      if (layout === 'masonry' && visibleItems.length > 0) {
        void stableFetchThumbnails.current(visibleItems);
      }
    },
    [visibleItems, layout],
    120,
  );

  // Handler for grid layout to request thumbs by index ranges
  const handleNeedThumbs = useCallback((items: ImageItem[]) => {
    if (items.length) void stableFetchThumbnails.current(items);
  }, []);

  const handleToggleSelectMode = useCallback(() => {
    setSelectMode(prev => {
      if (prev) {
        clearSelection();
        return false;
      }
      onClearPreview?.();
      return true;
    });
  }, [clearSelection, onClearPreview]);

  const handleBackgroundClick = useCallback(() => {
    clearSelection();
    onClearPreview?.();
  }, [clearSelection, onClearPreview]);

  const handleItemClick = useCallback(
    (event: React.MouseEvent, img: ImageItem) => {
      handleSelectionClick(event, img.hash);

      if (!selectMode) {
        onImageOpen?.(img);
      }
    },
    [handleSelectionClick, selectMode, onImageOpen],
  );

  return (
    <div className="flex flex-col w-full h-full bg-surface text-text font-sans">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-shrink-0 px-4 py-2 border-b border-border bg-surface-raised">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface-muted p-1 shadow-inner">
            {SIZES.map(s => (
              <Button
                key={s}
                variant="toggle"
                active={size === s}
                onClick={() => {
                  setSize(s);
                }}
              >
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
                onClick={() => {
                  setLayout(l);
                }}
                aria-label={l === 'grid' ? 'Grid layout' : 'Masonry layout'}
                className="size-9"
              >
                {l === 'grid' ? <GridIcon /> : <MasonryIcon />}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setStorageModalOpen(true);
            }}
            className="min-w-[7rem] px-4 py-2 text-sm font-medium"
          >
            썸네일 관리
          </Button>
          <Button
            variant={selectMode ? 'primary' : 'secondary'}
            onClick={handleToggleSelectMode}
            aria-pressed={selectMode}
            className="min-w-[7rem] px-4 py-2 text-sm font-medium"
          >
            {selectMode && selectedCount
              ? `Done (${String(selectedCount)})`
              : selectMode
                ? 'Done'
                : 'Select'}
          </Button>
          {selectMode && selectedCount > 0 && (
            <Button
              variant="secondary"
              onClick={handleStartCroquis}
              aria-pressed={selectMode}
              className="min-w-[7rem] px-4 py-2 text-sm font-medium"
            >
              Croquis
            </Button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-4" onClick={handleBackgroundClick}>
        {layout === 'grid' ? (
          <VirtualGridLayout
            images={images}
            size={size}
            onItemClick={handleItemClick}
            // For grid we *don't* rely on IO to fetch; pass stable no-op to avoid overhead
            observe={noop}
            unobserve={noop}
            selectMode={selectMode}
            thumbSize={thumbSize}
            onNeedThumbs={handleNeedThumbs}
            isSelected={isSelected}
          />
        ) : (
          <MasonryLayout
            images={images}
            selectMode={selectMode}
            onItemClick={handleItemClick}
            observe={observe}
            unobserve={unobserve}
            thumbSize={thumbSize}
            isSelected={isSelected}
            columnCount={masonryMetrics.columnCount}
          />
        )}
      </div>

      <CroquisStartModal
        open={croquisModalOpen && selectedCount > 0}
        preferences={croquisPreferences}
        remember={rememberCroquisOption}
        imageHashes={selectedHashes}
        moaId={moaId}
        onConfirm={handleCroquisConfirm}
        onClose={handleCroquisModalClose}
      />
      <ThumbnailStorageModal open={storageModalOpen} onClose={handleStorageModalClose} />
    </div>
  );
};

/* ---------------------------------------------
 * Backward-compatible wrapper (optional)
 * - Keeps existing import defaults working
 * --------------------------------------------- */
const GridView: React.FC<Props> = props => {
  const { gridData, onClearPreview, onImageOpen } = props;
  const [activeImage, setActiveImage] = useState<ImageItem | null>(null);

  useEffect(() => {
    if (!activeImage) return;
    const exists = gridData.images.some(img => img.hash === activeImage.hash);
    if (!exists) {
      setActiveImage(null);
    }
  }, [gridData, activeImage?.hash]);

  const handleImageClick = (image: ImageItem) => {
    setActiveImage(image);
    onImageOpen?.(image);
  };

  const handleClearPreview = () => {
    setActiveImage(null);
    onClearPreview?.();
  };
  return (
    <Split position="horizontal" className="w-full h-full">
      {({ Panel: SplitPanel }) => (
        <>
          <SplitPanel key="grid" minSize={320}>
            <GridContent
              {...props}
              onImageOpen={handleImageClick}
              onClearPreview={handleClearPreview}
            />
          </SplitPanel>
          {activeImage && (
            <SplitPanel key="sidebar" minSize={280} initialSize={360}>
              <FileDetailSidebar
                image={activeImage}
                onClose={() => {
                  setActiveImage(null);
                }}
              />
            </SplitPanel>
          )}
        </>
      )}
    </Split>
  );
};

export default GridView;

import { convertFileSrc } from '@tauri-apps/api/core';
import useThumbStore, { convertToThumbKey } from '@tgim/stores/thumbStore';
import { ResizeMode } from '@tgim/types/file';
import { ImageItem, Layout } from '@tgim/types/grid';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';

// Keep a global set of keys that have completed loading to avoid re-fade
const loadedOnceSet = new Set<string>();

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
  isScrolling?: boolean;
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
  isScrolling = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const isMasonry = layout === 'masonry';

  const key = useMemo(
    () =>
      convertToThumbKey(img.hash, {
        width: thumbSize,
        height: layout == 'masonry' ? 0 : thumbSize,
        dpr: 1,
        mode: ResizeMode.Original,
      }),
    [img.hash, thumbSize, layout],
  );

  // If previously loaded, start in loaded state to skip fade-in
  useEffect(() => {
    if (loadedOnceSet.has(key)) {
      setLoaded(true);
    }
  }, [key]);

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
    return () => {
      unobserve(el);
    };
  }, [img.hash, observe, unobserve]);

  const handleImageLoad = useCallback(() => {
    loadedOnceSet.add(key);
    setLoaded(true);
  }, [key]);

  const handleCardClick = useCallback(
    (event: React.MouseEvent) => {
      onClick(event, img);
    },
    [onClick, img],
  );

  const selectionClasses = selected
    ? 'border-accent ring-2 ring-accent/60 ring-offset-1 ring-offset-surface-raised'
    : 'border-border';

  // While scrolling or already loaded, avoid fade transition to reduce flicker
  const baseImgClass = isMasonry ? 'w-full h-auto object-cover' : 'w-full h-full object-cover';
  const imgClass =
    isScrolling || loaded
      ? baseImgClass
      : `${baseImgClass} opacity-0 transition-opacity duration-300`;

  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (!isMasonry) return {};
    return {
      containIntrinsicSize: `${String(thumbSize)}px ${String(thumbSize)}px`,
    };
  }, [isMasonry, thumbSize]);

  return (
    <div
      ref={containerRef}
      className={`group relative w-full ${
        isMasonry ? '' : 'h-full'
      } overflow-hidden rounded-lg border ${selectionClasses} bg-surface shadow-sm transition-all duration-200 hover:border-accent hover:shadow-lg hover:-translate-y-1 cursor-pointer ${sizeClass ?? ''}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      data-selected={selected ? 'true' : 'false'}
      style={cardStyle}
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
      <div className={`relative w-full ${isMasonry ? '' : 'h-full'}`}>
        {!stableSrc && (
          <div
            className={`w-full ${isMasonry ? '' : 'h-full'} bg-surface-muted animate-pulse`}
            style={isMasonry ? { height: thumbSize } : undefined}
          />
        )}
        {stableSrc && (
          <img
            src={stableSrc}
            alt={img.name}
            className={imgClass}
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

/* ---------------------------------------------
 * Thumb Card (memoized)
 * - Persist loaded state across remounts to avoid re-fade flicker
 * - Disable heavy transitions while scrolling
 * - Provide intrinsic size hints for masonry cards
 * --------------------------------------------- */

const ThumbCard = React.memo(ThumbCardComponent);

export default ThumbCard;

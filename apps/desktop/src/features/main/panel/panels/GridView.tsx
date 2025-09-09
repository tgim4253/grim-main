import { listen } from '@tauri-apps/api/event';
import { useMoa } from '@tgim/hooks/useMoa';
import { GridData, ImageItem } from '@tgim/types/grid';
import { ipc } from '../../../../lib/ipc';
import React, { useEffect, useMemo, useState } from 'react';
import useThumbStore, { convertToThumbKey } from '@tgim/stores/thumbStore';
import { ResizeMode } from '@tgim/types/file';
import { useShallow } from 'zustand/shallow';
import { convertFileSrc } from '@tauri-apps/api/core';
import Masonry from 'react-masonry-css'; // Masonry 라이브러리 import

// --- Helper Icon Components ---
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

// --- Props Interfaces ---
interface Props {
  gridData: GridData;
}

type Size = 'small' | 'medium' | 'large';
type Layout = 'grid' | 'masonry';

// --- Constants for Buttons ---
const SIZES: Size[] = ['small', 'medium', 'large'];
const LAYOUTS: Layout[] = ['grid', 'masonry'];

// --- Main GridView Component ---
const GridView: React.FC<Props> = ({ gridData }) => {
  const { moaId } = useMoa(location);
  const [layout, setLayout] = useState<Layout>('grid');
  const [size, setSize] = useState<Size>('medium');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Record<string, boolean>>({});

  const [images, setImages] = useState(gridData.images);
  const hashToImgMap = useMemo(() => {
    const map: Record<string, ImageItem> = {};
    images.forEach(img => {
      map[img.hash] = img;
    });
    return map;
  }, [images]);

  const { upsertThumb, thumb } = useThumbStore(
    useShallow(state => ({
      upsertThumb: state.upsert,
      thumb: state.byKey,
    })),
  );

  useEffect(() => {
    (async function () {
      if (moaId === null) return;

      const responses = await ipc.file.getThumbnails(moaId, {
        items: images
          .filter(img => {
            const key = convertToThumbKey(img.hash, {
              width: 128,
              height: 128,
              dpr: 1,
              mode: ResizeMode.Original,
            });
            if (thumb[key]) return false;
            return true;
          })
          .map(img => ({
            xxhs: img.hash,
            specs: [
              {
                width: 128,
                height: 128,
                dpr: 1,
                mode: ResizeMode.Original,
                key: convertToThumbKey(img.hash, {
                  width: 128,
                  height: 128,
                  dpr: 1,
                  mode: ResizeMode.Original,
                }),
              },
            ],
          })),
      });
      responses.items.forEach(item => {
        const img = hashToImgMap[item.xxhs];
        if (!img) return;

        item.specs.forEach(spec => {
          upsertThumb(spec.thumb_key, {
            status: spec.status === 'hit' ? 'ready' : 'pending',
            url: spec.status === 'hit' ? spec.url : undefined,
            updatedAt: Date.now(),
          });
        });
      });
    })();
  }, [moaId, images, hashToImgMap, upsertThumb]);

  const gridItemSizeClass = useMemo(() => {
    if (layout === 'masonry') {
      switch (size) {
        case 'small':
          return 'w-40'; // Masonry는 너비만 제어
        case 'large':
          return 'w-80';
        default:
          return 'w-64';
      }
    }
    // Grid 레이아웃은 고정 크기
    switch (size) {
      case 'small':
        return 'w-24 h-24'; // 96px
      case 'large':
        return 'w-48 h-48'; // 192px
      default:
        return 'w-36 h-36'; // 144px
    }
  }, [size, layout]);

  // [수정됨] Tailwind Arbitrary Values를 사용하여 올바른 클래스 생성
  const gridContainerClass = useMemo(() => {
    switch (size) {
      case 'small':
        return 'grid-cols-[repeat(auto-fill,minmax(theme(spacing.24),1fr))]';
      case 'large':
        return 'grid-cols-[repeat(auto-fill,minmax(theme(spacing.48),1fr))]';
      default: // medium
        return 'grid-cols-[repeat(auto-fill,minmax(theme(spacing.36),1fr))]';
    }
  }, [size]);

  return (
    <div className="w-full h-full flex flex-col bg-background-0 text-foreground font-sans">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-outline bg-background-1 flex-shrink-0">
        <div className="flex items-center gap-6">
          {/* Size Control */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-background-2">
            {SIZES.map(s => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  size === s
                    ? 'bg-accent text-white shadow-sm'
                    : 'text-foreground/70 hover:bg-background-hover hover:text-foreground'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Layout Control */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-background-2">
            {LAYOUTS.map(l => (
              <button
                key={l}
                onClick={() => setLayout(l)}
                className={`p-2 rounded-md transition-colors ${
                  layout === l
                    ? 'bg-accent text-white'
                    : 'text-foreground/70 hover:bg-background-hover hover:text-foreground'
                }`}
              >
                {l === 'grid' ? <GridIcon /> : <MasonryIcon />}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => setSelectMode(!selectMode)}
          className={`px-4 py-2 text-sm rounded-lg border transition-colors ${selectMode ? 'bg-accent text-white border-accent' : 'bg-background-2 border-outline hover:bg-background-hover'}`}
        >
          {selectMode ? 'Done' : 'Select'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {layout === 'grid' ? (
          <GridLayout
            images={images}
            sizeClass={gridItemSizeClass}
            containerClass={gridContainerClass}
            selectMode={selectMode}
            onItemClick={img => console.log(img)}
          />
        ) : (
          <MasonryLayout
            images={images}
            sizeClass={gridItemSizeClass}
            selectMode={selectMode}
            onItemClick={img => console.log(img)}
          />
        )}
      </div>
    </div>
  );
};

// --- Layout Components ---

function GridLayout({
  images,
  onItemClick,
  sizeClass,
  containerClass,
  selectMode,
}: {
  images: ImageItem[];
  onItemClick: (f: ImageItem) => void;
  sizeClass: string;
  containerClass: string;
  selectMode: boolean;
}) {
  return (
    <div className={`grid ${containerClass} gap-4`}>
      {images.map(img => (
        <ThumbCard
          key={img.id}
          img={img}
          onClick={() => onItemClick(img)}
          sizeClass={sizeClass}
          showCheckbox={selectMode}
          layout="grid"
        />
      ))}
    </div>
  );
}

// [개선됨] react-masonry-css 라이브러리를 사용한 MasonryLayout
function MasonryLayout({
  images,
  onItemClick,
  sizeClass,
  selectMode,
}: {
  images: ImageItem[];
  onItemClick: (f: ImageItem) => void;
  sizeClass: string;
  selectMode: boolean;
}) {
  const breakpointColumnsObj = {
    default: 6,
    1536: 6, // 2xl
    1280: 5, // xl
    1024: 4, // lg
    768: 3, // md
    640: 2, // sm
  };

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
            onClick={() => onItemClick(img)}
            sizeClass={sizeClass}
            showCheckbox={selectMode}
            layout="masonry"
          />
        </div>
      ))}
    </Masonry>
  );
}

// --- Card Component ---

function ThumbCard({
  img,
  onClick,
  sizeClass,
  showCheckbox,
  layout,
}: {
  img: ImageItem;
  sizeClass: string;
  onClick: () => void;
  showCheckbox: boolean;
  layout: Layout;
}) {
  const [loaded, setLoaded] = useState(false);

  const key = useMemo(() => {
    return convertToThumbKey(img.hash, {
      width: 128,
      height: 128,
      dpr: 1,
      mode: ResizeMode.Original,
    });
  }, [img.hash]);

  const { entry } = useThumbStore(
    useShallow(state => ({
      entry: state.byKey[key],
    })),
  );

  const thumbPath = useMemo(() => {
    if (entry?.status === 'ready' && entry.url) {
      return convertFileSrc(entry.url);
    }
    return undefined;
  }, [entry]);

  const handleImageLoad = () => {
    setLoaded(true);
  };

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-outline bg-surface shadow-sm transition-all duration-200 hover:border-accent hover:shadow-lg hover:-translate-y-1 cursor-pointer ${sizeClass}`}
      onClick={onClick}
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
        {!thumbPath && <div className="w-full h-full animate-pulse bg-background-2" />}
        {thumbPath && (
          <img
            src={thumbPath}
            alt={img.name}
            className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={handleImageLoad}
            loading="lazy"
          />
        )}
      </div>

      {/* Card Overlay/Footer for Grid view */}
      {layout === 'grid' && (
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 via-black/30 to-transparent">
          <p className="text-white text-xs font-medium truncate" title={img.name}>
            {img.name}
          </p>
        </div>
      )}

      {/* Card Footer for Masonry view */}
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
}

export default GridView;

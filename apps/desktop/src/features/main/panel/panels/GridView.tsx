import { listen } from '@tauri-apps/api/event';
import { useMoa } from '@tgim/hooks/useMoa';
import { GridData, ImageItem } from '@tgim/types/grid';
import { ipc } from '../../../../lib/ipc';
import React, { useEffect, useMemo, useState } from 'react';
import useThumbStore, { convertToThumbKey } from '@tgim/stores/thumbStore';
import { ResizeMode } from '@tgim/types/file';
import { useShallow } from 'zustand/shallow';
import { convertFileSrc } from '@tauri-apps/api/core';

interface Props {
  gridData: GridData;
}
const GridView: React.FC<Props> = ({ gridData }) => {
  const { moaId } = useMoa(location);
  const [layout, setLayout] = useState<'grid' | 'masonry'>('grid');
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [selectMode, setSelectMode] = useState(false);
  const [selectAll, setSelectAll] = useState(false);

  const [images, setImages] = useState(gridData.images);
  const hashToImgMap = useMemo(() => {
    const map: Record<string, ImageItem> = {};
    images.forEach(img => {
      map[img.hash] = img;
    });
    return map;
  }, [images]);

  const { upsertThumb } = useThumbStore(
    useShallow(state => ({
      upsertThumb: state.upsert,
    })),
  );
  useEffect(() => {
    (async function () {
      if (moaId === null) return;

      const responses = await ipc.file.getThumbnails(moaId, {
        items: images.map(img => ({
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
          if (spec.status === 'hit') {
            upsertThumb(spec.thumb_key, {
              status: 'ready',
              url: spec.url,
              updatedAt: Date.now(),
            });
          } else {
            upsertThumb(spec.thumb_key, {
              status: 'pending',
              updatedAt: Date.now(),
            });
          }
        });
      });
    })();
  }, [moaId]);

  const widthSize = useMemo(() => {
    switch (size) {
      case 'small':
        return 'w-16'; // 64px
      case 'large':
        return 'w-64'; // 256px
      default:
        return 'w-32'; // 128px
    }
  }, [size]);

  return (
    <div className="w-full h-full flex flex-col bg-background-0 text-foreground">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline bg-background-1">
        <div className="flex items-center gap-2">
          <label className="text-sm">보기</label>
          <select
            className="rounded-md border border-outline px-2 py-1 bg-background-2 text-foreground"
            value={size}
            onChange={e => setSize(e.target.value as any)}
          >
            <option value="small">작은 아이콘</option>
            <option value="medium">보통 아이콘</option>
            <option value="large">큰 아이콘</option>
          </select>

          <div className="ml-4 flex items-center gap-2">
            <button
              onClick={() => setLayout('grid')}
              className={`rounded-md px-3 py-1 border border-outline ${
                layout === 'grid' ? 'bg-background-hover' : 'bg-background-2'
              }`}
            >
              그리드
            </button>
            <button
              onClick={() => setLayout('masonry')}
              className={`rounded-md px-3 py-1 border border-outline ${
                layout === 'masonry' ? 'bg-background-hover' : 'bg-background-2'
              }`}
            >
              매소니
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 pb-8 bg-background-0">
        {
          layout === 'grid' ? (
            <GridLayout
              images={images}
              sizeClass={widthSize}
              selectMode={selectMode}
              onItemClick={img => console.log(img)}
            />
          ) : null
          // <MarsornyLayout
          //   images={images}
          //   size={size}
          //   selectMode={selectMode}
          //   onItemClick={img => console.log(img)}
          // />
        }
      </div>
    </div>
  );
};

function GridLayout({
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
  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
    >
      {images.map(img => (
        <ThumbCard
          key={img.id}
          img={img}
          onClick={() => onItemClick(img)}
          sizeClass={sizeClass}
          showCheckbox={selectMode}
        />
      ))}
    </div>
  );
}

// function MarsornyLayout({
//   images,
//   onItemClick,
//   sizeClass,
//   selectMode,
// }: {
//   images: ImageItem[];
//   onItemClick: (f: ImageItem) => void;
//   selected: Record<string, boolean>;
//   sizeClass: string;
//   selectMode: boolean;
// }) {
//   return (
//     <div className="gap-4" style={{ columnGap: 16 }}>
//       {images.map(img => (
//         <div key={img.id} className="mb-4 break-inside-avoid">
//           <ThumbCard
//             img={img}
//             onClick={() => onItemClick(img)}
//             sizeClass="max-w-full"
//             showCheckbox={selectMode}
//           />
//         </div>
//       ))}
//     </div>
//   );
// }

function ThumbCard({
  img,
  onClick,
  sizeClass,
  showCheckbox,
}: {
  img: ImageItem;
  sizeClass: string;
  onClick: () => void;
  showCheckbox: boolean;
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
    if (!entry) return undefined;
    if (entry.status === 'pending') return undefined;
    if (!entry.url) return undefined;
    return convertFileSrc(entry.url);
  }, [key, entry]);
  return (
    <div
      className={`group relative rounded-2xl border border-outline bg-surface p-2 shadow-sm hover:shadow-md transition ${sizeClass}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      {showCheckbox && (
        <div className="absolute left-3 top-3 z-10">
          <input type="checkbox" readOnly />
        </div>
      )}

      <div className="relative w-full overflow-hidden rounded-xl">
        {!loaded && <div className="aspect-square w-full animate-pulse bg-background-2" />}
        <img
          src={thumbPath}
          alt={img.name}
          className="w-full h-auto object-cover"
          onLoad={() => setLoaded(true)}
          loading="lazy"
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-foreground">
        <span className="truncate" title={thumbPath}>
          {img.name}
        </span>
        <span>{Math.round(img.size / 1024)} KB</span>
      </div>
    </div>
  );
}

export default GridView;

import { useCallback } from 'react';
import { ipc } from '../../../apps/desktop/src/lib/ipc';
import useThumbStore, { convertToThumbKey } from '@tgim/stores/thumbStore';
import { ImageFmt, ResizeMode, ThumbSpec, ThumbStatus } from '@tgim/types/file';
import { useShallow } from 'zustand/shallow';

const DEFAULT_MAX_BATCH = 100;

type Dpr = 1 | 2 | 3;

export interface ThumbnailRequest {
  hash: string;
  width: number;
  height: number;
  dpr?: Dpr;
  mode?: ResizeMode;
  fmt?: ImageFmt;
  key?: string;
}

interface UseThumbnailsOptions {
  moaId: string | null;
  maxBatchSize?: number;
}

export function useThumbnails({ moaId, maxBatchSize = DEFAULT_MAX_BATCH }: UseThumbnailsOptions) {
  const { upsertThumb } = useThumbStore(
    useShallow(state => ({
      upsertThumb: state.upsert,
    })),
  );

  const getThumbnailKey = useCallback(
    ({ hash, width, height, dpr = 1, mode = ResizeMode.Original, key }: ThumbnailRequest) => {
      return key ?? convertToThumbKey(hash, { width, height, dpr, mode });
    },
    [],
  );

  const ensureThumbnails = useCallback(
    async (requests: ThumbnailRequest[]) => {
      if (!moaId || requests.length === 0) {
        return;
      }

      const grouped = new Map<string, ThumbSpec[]>();
      const seenKeys = new Set<string>();

      for (const request of requests) {
        const { hash, width, height } = request;
        if (!hash || width <= 0) continue;

        const descriptor: ThumbnailRequest = {
          hash,
          width,
          height,
          dpr: request.dpr ?? 1,
          mode: request.mode ?? ResizeMode.Original,
          fmt: request.fmt,
          key: request.key,
        };

        const key = getThumbnailKey(descriptor);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        const currentEntry = useThumbStore.getState().byKey[key];
        if (currentEntry && currentEntry.status === 'ready' && currentEntry.url) {
          continue;
        }

        upsertThumb(key, { status: 'pending' });

        const spec: ThumbSpec = {
          width: descriptor.width,
          height: descriptor.height,
          key,
        };
        if (descriptor.dpr) spec.dpr = descriptor.dpr;
        if (descriptor.mode) spec.mode = descriptor.mode;
        if (descriptor.fmt) spec.fmt = descriptor.fmt;

        const specs = grouped.get(hash) ?? [];
        specs.push(spec);
        grouped.set(hash, specs);
      }

      if (grouped.size === 0) return;

      const payload = Array.from(grouped.entries()).map(([xxhs, specs]) => ({ xxhs, specs }));

      for (let i = 0; i < payload.length; i += maxBatchSize) {
        const chunk = payload.slice(i, i + maxBatchSize);
        try {
          const response = await ipc.file.getThumbnails(moaId, { items: chunk });
          response.items.forEach(item => {
            item.specs.forEach(spec => {
              const key = spec.thumbKey;
              if (!key) return;

              switch (spec.status) {
                case ThumbStatus.Hit:
                  upsertThumb(key, { status: 'ready', url: spec.url });
                  break;
                case ThumbStatus.Error:
                  upsertThumb(key, { status: 'error', error: spec.errorMsg });
                  break;
                default:
                  upsertThumb(key, { status: 'pending' });
                  break;
              }
            });
          });
        } catch (error) {
          console.error('Failed to fetch thumbnails:', error);
        }
      }
    },
    [getThumbnailKey, maxBatchSize, moaId, upsertThumb],
  );

  const getThumbnailUrl = useCallback(
    (request: ThumbnailRequest) => {
      const key = getThumbnailKey(request);
      const entry = useThumbStore.getState().byKey[key];
      if (entry && entry.status === 'ready' && entry.url) {
        return { key, url: entry.url };
      }
      return { key, url: undefined };
    },
    [getThumbnailKey],
  );

  return {
    ensureThumbnails,
    getThumbnailKey,
    getThumbnailUrl,
  };
}

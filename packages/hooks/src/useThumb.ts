import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ThumbSpec } from '@tgim/types/file';
import useThumbStore, {
  ThumbEntryEx,
  ThumbKey,
  ThumbStatus,
  convertToThumbKey,
} from '@tgim/stores/thumbStore';

export type ThumbFetcher = (params: {
  key: ThumbKey;
  hash: string;
}) => Promise<{ url: string } | { blob: Blob } | { missing: true }>;

export interface ThumbEventBus {
  on: (
    event: 'thumb_ready' | 'thumb_error',
    cb: (payload: { key: ThumbKey; url?: string; error?: string }) => void,
  ) => () => void;
}

export interface UseThumbOptions {
  /** Custom fetcher used when the cache is stale or missing. */
  fetcher: ThumbFetcher;
  /** Auto-attach hash -> key relationship for easier invalidation. */
  attach?: boolean;
  /** Automatically retry when the previous status was error or missing. */
  retryOnError?: boolean;
  /** Automatically trigger fetch on mount. */
  autoFetch?: boolean;
  /** Optional bus for late notifications from background workers. */
  eventBus?: ThumbEventBus;
}

export interface UseThumbResult {
  url?: string;
  status: ThumbStatus;
  error?: string;
  refetch: () => void;
  key: ThumbKey;
  updatedAt: number;
}

const isBrowser = typeof window !== 'undefined' && typeof URL !== 'undefined';

export const useThumb = (
  hash: string,
  spec: Partial<ThumbSpec> & { v?: number },
  options: UseThumbOptions,
): UseThumbResult => {
  const { fetcher, attach = true, retryOnError = true, autoFetch = true, eventBus } = options;
  const key = useMemo(
    () =>
      convertToThumbKey(hash, {
        width: spec.width,
        height: spec.height,
        dpr: spec.dpr,
        mode: spec.mode,
        v: spec.v,
      }),
    [hash, spec.width, spec.height, spec.dpr, spec.mode, spec.v],
  );
  const store = useThumbStore;
  const entry = store.getState().getByKey(key);

  useEffect(() => {
    if (!attach) return;
    store.getState().attach(hash, key);
  }, [attach, hash, key, store]);

  const [, forceRender] = useState(0);
  useEffect(() => {
    const unsub = store.subscribe(
      state => state.byKey[key],
      () => forceRender(prev => prev + 1),
    );
    return () => unsub();
  }, [key, store]);

  const doFetch = useCallback(async () => {
    const st = store.getState();

    const inflight = st.inflight.get(key);
    if (inflight) return inflight;

    st.upsert(key, { status: 'pending', error: undefined });

    const promise: Promise<ThumbEntryEx> = (async () => {
      try {
        const result = await fetcher({ key, hash });
        if ('missing' in result) {
          st.upsert(key, { status: 'missing' });
        } else if ('blob' in result) {
          const url = isBrowser ? URL.createObjectURL(result.blob) : '';
          st.upsert(key, { status: 'ready', url });
        } else if ('url' in result) {
          st.upsert(key, { status: 'ready', url: result.url });
        }
        st.evictLRU();
        return st.getByKey(key)!;
      } catch (error: any) {
        st.upsert(key, { status: 'error', error: String(error?.message ?? error) });
        return st.getByKey(key)!;
      } finally {
        store.getState().setInflight(key, undefined);
      }
    })();

    store.getState().setInflight(key, promise);
    return promise;
  }, [fetcher, hash, key, store]);

  useEffect(() => {
    if (!autoFetch) return;
    const current = store.getState().getByKey(key);
    if (!current || current.status === 'missing' || (retryOnError && current.status === 'error')) {
      void doFetch();
    }
  }, [autoFetch, doFetch, key, retryOnError, store]);

  useEffect(() => {
    if (!eventBus) return;
    const offReady = eventBus.on('thumb_ready', ({ key: readyKey, url }) => {
      if (readyKey === key && url) {
        store.getState().upsert(key, { status: 'ready', url });
      }
    });
    const offError = eventBus.on('thumb_error', ({ key: errorKey, error }) => {
      if (errorKey === key) {
        store.getState().upsert(key, { status: 'error', error });
      }
    });
    return () => {
      offReady();
      offError();
    };
  }, [eventBus, key, store]);

  return {
    url: entry?.url,
    status: entry?.status ?? 'pending',
    error: entry?.error,
    refetch: () => {
      void doFetch();
    },
    key,
    updatedAt: entry?.updatedAt ?? 0,
  };
};

export const prefetchThumbs = async (
  items: Array<{ hash: string; spec: Partial<ThumbSpec> & { v?: number } }>,
  fetcher: ThumbFetcher,
  options: { attach?: boolean } = {},
) => {
  const { attach = false } = options;
  const st = useThumbStore.getState();
  const tasks: Promise<ThumbEntryEx>[] = [];

  for (const { hash, spec } of items) {
    const key = convertToThumbKey(hash, spec);
    const existing = st.getByKey(key);
    if (attach) {
      st.attach(hash, key);
    }

    if (existing && existing.status === 'ready') {
      continue;
    }

    if (st.inflight.get(key)) {
      continue;
    }

    st.upsert(key, { status: 'pending', error: undefined });

    const task: Promise<ThumbEntryEx> = (async () => {
      try {
        const result = await fetcher({ key, hash });
        if ('missing' in result) {
          st.upsert(key, { status: 'missing' });
        } else if ('blob' in result) {
          const url = isBrowser ? URL.createObjectURL(result.blob) : '';
          st.upsert(key, { status: 'ready', url });
        } else if ('url' in result) {
          st.upsert(key, { status: 'ready', url: result.url });
        }
        return st.getByKey(key)!;
      } catch (error: any) {
        st.upsert(key, { status: 'error', error: String(error?.message ?? error) });
        return st.getByKey(key)!;
      } finally {
        useThumbStore.getState().setInflight(key, undefined);
      }
    })();

    useThumbStore.getState().setInflight(key, task);
    tasks.push(task);
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
    st.evictLRU();
  }
};

export type { ThumbStatus } from '@tgim/stores/thumbStore';

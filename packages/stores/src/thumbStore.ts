import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ThumbEntry, ThumbSpec } from '@tgim/types/file';

/**
 * key_format:
 * <hash>_<WxH>_dpr<1|2>_<upscale|original>_<version>
 *
 * - `<hash>`: xxhs_64
 * - `<WxH>`: width x height
 * - `dpr<1|2>`: device pixel ratio
 * - `<upscale|original>`: resize strategy
 * - `<version>`: schema version
 */
export type ThumbKey = string;
export type Hash = string;

const isBrowser = typeof window !== 'undefined' && typeof URL !== 'undefined';

export type ThumbStatus = 'pending' | 'ready' | 'error' | 'missing';

export interface ThumbEntryEx extends ThumbEntry {
  status: ThumbStatus;
  /** blob/object URL */
  url?: string;
  /** epoch ms */
  updatedAt: number;
  /** optional error payload */
  error?: string;
  /** optional schema version */
  v?: number;
}

export interface ThumbStoreOptions {
  /** LRU capacity (number of keys to keep with blob URLs). */
  maxLRU: number;
  /** TTL in ms to consider an entry stale (only for `pending` or `error`). */
  ttlMs: number;
}

interface ThumbState {
  byKey: Record<ThumbKey, ThumbEntryEx>;
  byHash: Record<Hash, ThumbKey[]>; // hash -> set of key
  lru: ThumbKey[]; // least recently used (oldest first)
  options: ThumbStoreOptions;

  // runtime: in-flight fetches (dedupe)
  inflight: Map<ThumbKey, Promise<ThumbEntryEx>>;

  // mutations
  upsert: (thumbKey: ThumbKey, patch: Partial<ThumbEntryEx>) => void;
  touch: (thumbKey: ThumbKey) => void;
  attach: (hash: string, thumbKey: ThumbKey) => void;
  evictLRU: (max?: number) => void;
  purgeStale: () => void;
  clearAll: () => void;
  detachByHash: (hash: string) => void;

  // getters
  getThumbPathByKey: (key: ThumbKey) => string | undefined;
  getByKey: (key: ThumbKey) => ThumbEntryEx | undefined;
  getKeysByHash: (hash: string) => ThumbKey[];

  // inflight helpers
  setInflight: (key: ThumbKey, p?: Promise<ThumbEntryEx>) => void;
}

export const defaultThumbOptions: ThumbStoreOptions = {
  maxLRU: 500,
  ttlMs: 30_000,
};

export const useThumbStore = create<ThumbState>()(
  immer((set, get) => ({
    byKey: {},
    byHash: {},
    lru: [],
    options: defaultThumbOptions,
    inflight: new Map(),

    upsert: (key, patch) => {
      const cur = get().byKey[key];
      const prevUrl = cur?.url;
      const now = Date.now();
      const next: ThumbEntryEx = {
        ...cur,
        ...patch,
        status: patch.status ?? cur?.status ?? 'pending',
        updatedAt: now,
        v: patch.v ?? cur?.v ?? 1,
      } as ThumbEntryEx;

      set(s => {
        s.byKey[key] = next;

        if (isBrowser && prevUrl && prevUrl !== next.url && prevUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(prevUrl);
          } catch {
            /* noop */
          }
        }
      });

      if (next.status === 'ready') {
        set(s => {
          const lru = s.lru.filter(k => k !== key);
          lru.push(key);
          s.lru = lru;
        });
      }
    },

    touch: key => {
      set(s => {
        const lru = s.lru.filter(k => k !== key);
        lru.push(key);
        s.lru = lru;
      });
    },

    attach: (hash, key) => {
      set(s => {
        const setForHash = s.byHash[hash] ?? [];
        if (!setForHash.includes(key)) {
          setForHash.push(key);
        }
        s.byHash[hash] = setForHash;
      });
    },

    evictLRU: max => {
      const { lru, byKey, options } = get();
      const capacity = max ?? options.maxLRU;
      if (lru.length <= capacity) return;

      const cut = lru.length - capacity;
      const toEvict = lru.slice(0, cut);
      const evictSet = new Set(toEvict);

      if (isBrowser) {
        for (const k of toEvict) {
          const entry = byKey[k];
          if (entry?.url && entry.url.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(entry.url);
            } catch {
              /* noop */
            }
          }
        }
      }

      set(s => {
        s.lru = s.lru.slice(cut);
        for (const k of Object.keys(s.byKey)) {
          if (evictSet.has(k)) {
            const value = s.byKey[k];
            if (value) {
              s.byKey[k] = { ...value, url: undefined } as ThumbEntryEx;
            }
          }
        }
      });
    },

    purgeStale: () => {
      const now = Date.now();
      const { byKey, options } = get();
      const ttl = options.ttlMs;
      for (const [k, entry] of Object.entries(byKey)) {
        if (
          (entry.status === 'pending' || entry.status === 'error') &&
          now - entry.updatedAt > ttl
        ) {
          get().upsert(k, { status: 'missing', error: undefined });
        }
      }
    },

    clearAll: () => {
      const { byKey } = get();
      if (isBrowser) {
        for (const entry of Object.values(byKey)) {
          if (entry?.url && entry.url.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(entry.url);
            } catch {
              /* noop */
            }
          }
        }
      }

      set(s => {
        s.byKey = {};
        s.byHash = {};
        s.lru = [];
        s.inflight.clear();
      });
    },

    detachByHash: hash => {
      set(s => {
        delete s.byHash[hash];
      });
    },

    getThumbPathByKey: key => {
      const thumb = get().byKey[key];
      if (thumb && thumb.status === 'ready' && thumb.url) {
        get().touch(key);
        return thumb.url;
      }
      return undefined;
    },

    getByKey: key => get().byKey[key],
    getKeysByHash: hash => get().byHash[hash] ?? [],

    setInflight: (key, promise) => {
      set(state => {
        if (!promise) {
          state.inflight.delete(key);
        } else {
          state.inflight.set(key, promise);
        }
      });
    },
  })),
);

export const convertToThumbKey = (hash: string, spec: Partial<ThumbSpec> & { v?: number }) => {
  const width = spec.width ?? 0;
  const height = spec.height ?? 0;
  const dpr = spec.dpr ?? 1;
  const mode = String(spec.mode ?? 'original');
  const version = spec.v ?? 1;
  return `${hash}_${width}x${height}_dpr${dpr}_${mode}_v${version}`;
};

export const parseThumbKey = (key: ThumbKey) => {
  const modern = key.match(/^(.+?)_(\d+)x(\d+)_dpr(\d+)_(upscale|original)_v(\d+)$/);
  if (modern) {
    return {
      hash: modern[1],
      width: Number(modern[2]),
      height: Number(modern[3]),
      dpr: Number(modern[4]),
      mode: modern[5] as 'upscale' | 'original',
      v: Number(modern[6]),
    };
  }

  const legacy = key.match(/^(.+?)_(\d+)x(\d+)_dpr(\d+)_(upscale|original)$/);
  if (legacy) {
    return {
      hash: legacy[1],
      width: Number(legacy[2]),
      height: Number(legacy[3]),
      dpr: Number(legacy[4]),
      mode: legacy[5] as 'upscale' | 'original',
      v: 1,
    };
  }

  return null;
};

export default useThumbStore;

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { ThumbEntry } from '@tgim/types/file';

/**
 * key_format:
 * <hash>_<WxH>_dpr<1|2>_<upscale|original>_<version>
 *
 * - `<hash>`: xxhs_64
 * - `<WxH>`: width x height
 * - `dpr<1|2>`: device pixel ratio
 * - `<upscale|original>`: is resized when original image smaller than requested size
 * - `<version>`: schema version
 *
 * @example
 * const k1 = "adsfas_128x128_dpr1_upscale_v1";
 * const k2 = "xyz123_512x512_dpr2_original_v3";
 */
type ThumbKey = string;
type Hash = string;

interface ThumbState {
  byKey: Record<ThumbKey, ThumbEntry>;
  byHash: Record<Hash, ThumbKey[]>; // hash -> set of key
  inflight: Record<ThumbKey, Promise<void>>; // inflight = map of ongoing requests (thumbKey -> Promise)
  lru: ThumbKey[]; // least resently used cache. (oldest first, least end)

  enqueueLow: (jobs: Array<{ thumbKey: ThumbKey; req: any }>) => void;
  upsert: (thumbKey: ThumbKey, patch: Partial<ThumbEntry>) => void;
  touch: (thumbKey: ThumbKey) => void;
  markInflight: (thumbKey: ThumbKey, p: Promise<void>) => void;
  clearInflight: (thumbKey: ThumbKey) => void;
  attach: (hash: string, thumbKey: ThumbKey) => void;
  evictLRU: (max: number) => void;
}

export const useThumbStore = create<ThumbState>()(
  immer((set, get) => ({
    byKey: {},
    byHash: {},
    inflight: {},
    lru: [],

    upsert: (key, patch) => {
      const cur = get().byKey[key] ?? { status: 'pending', updatedAt: 0, v: 1 };
      const prevUrl = cur.url;
      const next = { ...cur, ...patch, updatedAt: Date.now() };
      set(s => {
        s.byKey[key] = next;

        // Revoke previous blob URL if replaced to avoid leaks
        // (safe-guard: don't revoke if same string)
        if (prevUrl && prevUrl !== next.url && prevUrl.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(prevUrl);
          } catch {}
        }
      });

      // Move to MRU only when entry becomes ready
      if (next.status === 'ready') {
        set(s => {
          const lru = s.lru.filter(k => k !== key);
          lru.push(key);
          s.lru = lru;
        });
      }
    },

    // Touch for read-access MRU update
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
        setForHash.push(key);
        s.byHash[hash] = setForHash;
      });
    },
    markInflight: (key, p) =>
      set(s => {
        s.inflight[key] = p;
      }),
    clearInflight: key => {
      set(s => {
        delete s.inflight[key];
      });
    },

    enqueueLow: jobs => {
      // TODO: implement a low-priority queue with a max concurrency.
      // e.g., keep a module-scoped scheduler and push jobs here.
      void jobs;
    },
    evictLRU: max => {
      const { lru, byKey } = get();
      if (lru.length <= max) return;

      const cut = lru.length - max;
      const toEvict = lru.slice(0, cut);
      const evictSet = new Set(toEvict); // lookups

      // revoke Blob URLs for evicted keys
      for (const k of toEvict) {
        const e = byKey[k];
        if (e?.url?.startsWith('blob:')) {
          try {
            URL.revokeObjectURL(e.url);
          } catch {}
        }
      }

      set(s => {
        s.lru = s.lru.slice(cut);

        for (const k of Object.keys(s.byKey)) {
          if (evictSet.has(k)) {
            const v = s.byKey[k];
            if (v) s.byKey[k] = { ...v, url: undefined };
          }
        }
      });
    },
  })),
);
export default useThumbStore;

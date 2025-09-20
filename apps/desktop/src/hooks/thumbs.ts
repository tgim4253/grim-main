import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { ThumbFetcher, type ThumbEventBus } from '@tgim/hooks/useThumb';
import useThumbStore, { parseThumbKey, type ThumbKey } from '@tgim/stores/thumbStore';
import {
  ResizeMode,
  ThumbRequest,
  ThumbResSpec,
  ThumbStatus as ThumbResponseStatus,
} from '@tgim/types/file';
import { ipc } from '../lib/ipc';

type ThumbEventHandler = (payload: { key: ThumbKey; url?: string; error?: string }) => void;

class IpcThumbEventBus implements ThumbEventBus {
  private listeners: Record<'thumb_ready' | 'thumb_error', Set<ThumbEventHandler>> = {
    thumb_ready: new Set(),
    thumb_error: new Set(),
  };

  on(event: 'thumb_ready' | 'thumb_error', cb: ThumbEventHandler) {
    const bucket = this.listeners[event];
    bucket.add(cb);
    return () => {
      bucket.delete(cb);
    };
  }

  emit(
    event: 'thumb_ready' | 'thumb_error',
    payload: { key: ThumbKey; url?: string; error?: string },
  ) {
    for (const handler of this.listeners[event]) {
      handler(payload);
    }
  }
}

export const thumbEventBus = new IpcThumbEventBus();

const applyThumbSpecs = (specs: ThumbResSpec[]) => {
  const store = useThumbStore.getState();

  for (const spec of specs) {
    const key = spec.thumb_key ?? spec.key;
    if (!key) continue;

    if (spec.status === ThumbResponseStatus.Hit && spec.url) {
      store.upsert(key, { status: 'ready', url: spec.url });
      thumbEventBus.emit('thumb_ready', { key, url: spec.url });
    } else if (spec.status === ThumbResponseStatus.Error) {
      const message = spec.error_msg ?? 'thumbnail error';
      store.upsert(key, { status: 'error', error: message });
      thumbEventBus.emit('thumb_error', { key, error: message });
    } else if (spec.status === ThumbResponseStatus.Miss) {
      store.upsert(key, { status: 'missing' });
    }
  }

  store.evictLRU();
};

let thumbEventListener: Promise<UnlistenFn> | null = null;

export const ensureThumbEventListener = () => {
  if (!thumbEventListener) {
    thumbEventListener = listen<{ items: ThumbResSpec[] }>('thumbnails://created', event => {
      const items = event.payload?.items ?? [];
      applyThumbSpecs(items);
    });
  }
  return thumbEventListener;
};

export const disposeThumbEventListener = async () => {
  if (!thumbEventListener) return;
  const unlisten = await thumbEventListener;
  unlisten();
  thumbEventListener = null;
};

export const makeThumbFetcher = (moaId: string | null): ThumbFetcher => {
  return async ({ key, hash }) => {
    if (!moaId) {
      return { missing: true } as const;
    }

    const parsed = parseThumbKey(key);
    if (!parsed) {
      throw new Error(`Invalid thumbnail key: ${key}`);
    }

    const request: ThumbRequest = {
      items: [
        {
          xxhs: hash,
          specs: [
            {
              width: parsed.width,
              height: parsed.height,
              dpr: (parsed.dpr as 1 | 2 | 3) ?? 1,
              mode: parsed.mode === 'upscale' ? ResizeMode.Upscale : ResizeMode.Original,
              key,
            },
          ],
        },
      ],
    };

    const response = await ipc.file.getThumbnails(moaId, request);
    const info = response.items?.find(item => item.xxhs === hash);
    const spec = info?.specs?.find(s => (s.thumb_key ?? s.key) === key);

    if (!spec) {
      return { missing: true } as const;
    }

    if (spec.status === ThumbResponseStatus.Hit && spec.url) {
      return { url: spec.url } as const;
    }

    if (spec.status === ThumbResponseStatus.Error) {
      throw new Error(spec.error_msg ?? 'thumbnail error');
    }

    return { missing: true } as const;
  };
};

import { ThumbFetcher } from '@tgim/hooks/useThumb';
import { parseThumbKey } from '@tgim/stores/thumbStore';
import { ResizeMode, ThumbRequest, ThumbStatus as ThumbResponseStatus } from '@tgim/types/file';
import { ipc } from '../lib/ipc';

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

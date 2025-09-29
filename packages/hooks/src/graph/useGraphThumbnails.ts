import { useEffect, useMemo, useRef } from 'react';
import { GraphNode } from '@tgim/types/graph';
import { ResizeMode } from '@tgim/types/file';
import useThumbStore from '@tgim/stores/thumbStore';
import { convertFileSrc } from '@tauri-apps/api/core';

type RequestGenerator = (params: {
  hash: string;
  width: number;
  height: number;
  dpr: 1;
  mode: ResizeMode;
}) => { key: string };

type UrlResolver = (params: {
  hash: string;
  width: number;
  height: number;
  dpr: 1;
  mode: ResizeMode;
}) => { url?: string };

interface Params {
  nodes: GraphNode[];
  ensureThumbnails: (requests: Array<{
    hash: string;
    width: number;
    height: number;
    dpr: 1;
    mode: ResizeMode;
    key: string;
  }>) => Promise<void> | void;
  getThumbnailKey: RequestGenerator;
  getThumbnailUrl: UrlResolver;
  refresh: () => void;
  size?: number;
}

export function useGraphThumbnails({
  nodes,
  ensureThumbnails,
  getThumbnailKey,
  getThumbnailUrl,
  refresh,
  size = 64,
}: Params) {
  const imageNodes = useMemo(
    () => nodes.filter(node => node.type === 'image' && node.hash),
    [nodes],
  );
  const imageNodesRef = useRef<GraphNode[]>([]);

  useEffect(() => {
    imageNodesRef.current = imageNodes;
  }, [imageNodes]);

  useEffect(() => {
    if (imageNodes.length === 0) return;

    const requests = imageNodes
      .filter(
        (node): node is GraphNode & { hash: string } =>
          typeof node.hash === 'string' && node.hash.length > 0,
      )
      .map(node => {
        const request = {
          hash: node.hash,
          width: size,
          height: size,
          dpr: 1 as const,
          mode: ResizeMode.Original,
        };
        const key = getThumbnailKey(request);
        if (node.thumbKey !== key) {
          node.thumbKey = key;
          node.url = undefined;
        }

        const { url } = getThumbnailUrl(request);
        if (url !== undefined) {
          node.url = convertFileSrc(url);
          node.key = getThumbnailKey(request);
        }

        return { ...request, key };
      });

    if (requests.length === 0) return;

    void ensureThumbnails(requests);
  }, [ensureThumbnails, getThumbnailKey, getThumbnailUrl, imageNodes, size]);

  useEffect(() => {
    const unsubscribe = useThumbStore.subscribe(
      state => state.byKey,
      byKey => {
        let changed = false;
        imageNodesRef.current.forEach(node => {
          const key = node.thumbKey;
          if (!key) return;
          const entry = byKey[key];
          const nextUrl =
            entry?.status === 'ready' && entry.url ? convertFileSrc(entry.url) : undefined;
          if (node.url !== nextUrl) {
            node.url = nextUrl;
            changed = true;
          }
        });
        if (changed) {
          refresh();
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [refresh]);
}

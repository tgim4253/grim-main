import usePanelsStore from '@tgim/stores/panelStore';
import { GraphConnection, GraphData, GraphNode, GraphNodeType, NodeCrop } from '@tgim/types/graph';
import { NormalizedCropRect } from '@tgim/types/crop';
import { NodeRenderer, clearNodeSpriteCaches, getGraphPalette } from '@tgim/ui/index';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { useShallow } from 'zustand/shallow';
import * as d3 from 'd3-force';
import useThumbStore from '@tgim/stores/thumbStore';
import { useMoa } from '@tgim/hooks/useMoa';
import { ResizeMode } from '@tgim/types/file';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ThumbnailRequest, useThumbnails } from '../../../../hooks';
import { useTheme } from '../../../../theme/ThemeProvider';
import { toNormalizedCropRect } from '@tgim/utils/crop';

interface Props {
  graphData: GraphData;
  rootGraphNodeId: string;
}

const GRAPH_THUMB_SIZE = 64;
const CROP_THUMB_SCALE = 4;

const GraphView: React.FC<Props> = ({ graphData, rootGraphNodeId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const { theme } = useTheme();
  const [linkStroke, setLinkStroke] = useState(() => getGraphPalette().link);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const getSourceId = useCallback((source: string | { id: string }) => {
    if (typeof source === 'object' && 'id' in source) {
      return source.id;
    }
    return source;
  }, []);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        resizeObserver.unobserve(containerRef.current);
      }
    };
  }, []);
  const nodesById = useMemo(() => {
    const nodesById = Object.fromEntries(graphData.nodes.map(node => [node.id, node]));
    graphData.nodes.forEach(node => {
      node.isHidden = node.isLeaf;
      node.childLinks = [];
    });
    graphData.links.forEach(link => {
      const source = getSourceId(link.source);
      (nodesById[source].childLinks as GraphConnection[]).push(link);
    });
    return nodesById;
  }, [graphData.nodes]);
  const { moaId } = useMoa(location);
  const { ensureThumbnails, getThumbnailKey, getThumbnailUrl } = useThumbnails({ moaId });

  const GAP = 90;

  const getTarget = useCallback(
    (target: string | GraphNode) => {
      if (typeof target === 'object') {
        return target;
      }
      return nodesById[target];
    },
    [nodesById],
  );

  const getPrunedTree = () => {
    const visibleNodes = [];
    const visibleLinks = [];
    (function traverseTree(node = nodesById[rootGraphNodeId]) {
      visibleNodes.push(node);
      const filteredLinks = (node.childLinks as GraphConnection[]).filter(link => {
        const target: GraphNode = getTarget(link.target);
        return !target.isHidden;
      });
      visibleLinks.push(...filteredLinks);
      filteredLinks.map(link => getTarget(link.target)).forEach(traverseTree);
    })();
    return { nodes: visibleNodes, links: visibleLinks };
  };
  const [prunedTree, setPrunedTree] = useState(getPrunedTree());
  const imageNodes = useMemo(
    () =>
      prunedTree.nodes.filter(node => {
        if (node.type === 'image') {
          return typeof node.hash === 'string' && node.hash.length > 0;
        }
        if (node.type === 'crop') {
          return typeof node.originHash === 'string' && node.originHash.length > 0;
        }
        return false;
      }),
    [prunedTree.nodes],
  );
  const imageNodesRef = useRef<GraphNode[]>([]);
  useEffect(() => {
    imageNodesRef.current = imageNodes;
  }, [imageNodes]);

  useEffect(() => {
    if (imageNodes.length === 0) return;

    const baseThumbSize = Math.max(1, Math.round(GRAPH_THUMB_SIZE * devicePixelRatio));
    const cropThumbSize = Math.max(
      baseThumbSize,
      Math.round(GRAPH_THUMB_SIZE * CROP_THUMB_SCALE * devicePixelRatio),
    );

    const requests = imageNodes.reduce<ThumbnailRequest[]>((acc, node) => {
      const hash =
        node.type === 'crop'
          ? typeof node.originHash === 'string'
            ? node.originHash
            : undefined
          : typeof node.hash === 'string'
            ? node.hash
            : undefined;
      if (!hash) return acc;

      const targetSize = node.type === 'crop' ? cropThumbSize : baseThumbSize;

      // Request thumbnails using only the width so the service preserves the
      // original aspect ratio. Square thumbnails shift the crop coordinates
      // and make the preview appear offset in the graph.
      const request: ThumbnailRequest = {
        hash,
        width: targetSize,
        height: 0,
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
        node.key = key;
      }

      acc.push({ ...request, key });
      return acc;
    }, []);

    if (requests.length === 0) return;

    void ensureThumbnails(requests);
  }, [devicePixelRatio, ensureThumbnails, getThumbnailKey, getThumbnailUrl, imageNodes]);

  useEffect(() => {
    const unsubscribe = useThumbStore.subscribe(
      state => state.byKey,
      byKey => {
        imageNodesRef.current.forEach(node => {
          const key = node.thumbKey as string | undefined;
          if (!key) return;
          const entry = byKey[key];

          const nextUrl =
            entry?.status === 'ready' && entry.url ? convertFileSrc(entry.url) : undefined;
          if (node.url !== nextUrl) {
            node.url = nextUrl;
          }
        });
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (fgRef.current) {
      const fg = fgRef.current;
      fg.d3Force(
        'radial',
        d3
          .forceRadial(
            (d: unknown) => {
              const node = d as GraphNode;
              const depth = node.depth as number;
              if (!isFinite(depth)) return 0;
              return depth * GAP;
            },
            0,
            0,
          )
          .strength((d: unknown) => {
            const node = d as GraphNode;
            if (!node.isLeaf) return 0.9;
            else return 0;
          }),
      );
      (fg.d3Force('charge') as d3.ForceManyBody<GraphNode> | undefined)?.strength(-50);

      (fg.d3Force('link') as d3.ForceLink<GraphNode, GraphConnection> | undefined)
        ?.distance(l => {
          const link = l;
          return Math.abs(
            ((link.source as GraphNode).depth ?? 0) - ((link.target as GraphNode).depth ?? 0),
          ) <= 1
            ? 40
            : 110;
        })
        .strength(0.6);

      fg.d3Force('collide', d3.forceCollide(10));
    }
    setTimeout(() => {
      showAllNode();
    }, 300);
  }, []);

  const showAllNode = () => {
    graphData.nodes.forEach(node => {
      node.isHidden = false;
    });
    setPrunedTree(getPrunedTree());
  };

  const { openNode } = usePanelsStore(useShallow(s => ({ openNode: s.addPanelWithoutContainer })));
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      clearNodeSpriteCaches();
      setLinkStroke(getGraphPalette().link);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [theme]);

  return (
    <div
      ref={containerRef}
      className="transition-colors"
      style={{ width: '100%', height: '100%', background: 'var(--ds-graph-canvas)' }}
    >
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={prunedTree}
        backgroundColor="rgba(0,0,0,0)"
        nodeLabel="label"
        nodeAutoColorBy="group"
        // onEngineStop={() => openAllNode()}
        // linkDirectionalArrowLength={3.5}
        // linkDirectionalArrowRelPos={0.96}
        linkColor={linkStroke}
        linkWidth={1.5}
        linkCurvature={0}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const computedCrop =
            node.type === 'crop' ? toNormalizedCropRect(node.crop as NodeCrop | null) : null;
          const fallbackCrop = node.cropRect as NormalizedCropRect | undefined;
          const normalizedCrop = computedCrop ?? fallbackCrop ?? null;
          if (normalizedCrop) {
            node.cropRect = normalizedCrop;
          }
          NodeRenderer(node.type as GraphNodeType)(
            ctx,
            {
              x: node.x || 0,
              y: node.y || 0,
              size: node.size as number,
              label: node.label as string,
              url: node.url,
              thumbKey: node.thumbKey,
              cropRect: normalizedCrop ?? undefined,
            },
            globalScale,
          );
        }}
        onNodeClick={node => {
          node.collapsed = false;
          setPrunedTree(getPrunedTree());
          if (node.id) {
            openNode({
              nodeId: node.nodeId as string,
              name: String(node.id),
            });
          }
        }}
      />
    </div>
  );
};

export default GraphView;

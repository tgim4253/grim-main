import usePanelsStore from '@tgim/stores/panelStore';
import { Connection, GraphConnection, GraphData, GraphNode } from '@tgim/types/graph';
import { NodeRenderer, clearNodeSpriteCaches, getGraphPalette } from '@tgim/ui/index';
import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { useShallow } from 'zustand/shallow';
import * as d3 from 'd3-force';
import useThumbStore from '@tgim/stores/thumbStore';
import { useMoa } from '@tgim/hooks/useMoa';
import { ResizeMode } from '@tgim/types/file';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useThumbnails } from '../../../../hooks';
import { useTheme } from '../../../../theme/ThemeProvider';

interface Props {
  graphData: GraphData;
  rootNodeId: string;
  rootGraphNodeId: string;
}

const GRAPH_THUMB_SIZE = 64;

const GraphView: React.FC<Props> = ({ graphData, rootNodeId, rootGraphNodeId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const { theme } = useTheme();
  const [linkStroke, setLinkStroke] = useState(() => getGraphPalette().link);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
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
    if (!graphData) return {};
    const nodesById = Object.fromEntries(graphData.nodes.map(node => [node.id, node]));
    graphData.nodes.forEach(node => {
      node.isHidden = node.isLeaf;
      node.childLinks = [];
    });
    graphData.links.forEach(link => {
      const source = typeof link.source === 'object' ? (link.source as any).id : link.source;
      nodesById[source].childLinks.push(link);
    });
    return nodesById;
  }, [graphData.nodes]);
  const { moaId } = useMoa(location);
  const { ensureThumbnails, getThumbnailKey, getThumbnailUrl } = useThumbnails({ moaId });

  const GAP = 90;

  const getPrunedTree = () => {
    const visibleNodes = [];
    const visibleLinks = [];
    (function traverseTree(node = nodesById[rootGraphNodeId]) {
      visibleNodes.push(node);
      const filteredLinks = node.childLinks.filter((link: any) => {
        const target = typeof link.target === 'object' ? link.target : nodesById[link.target];
        return !target.isHidden;
      });
      visibleLinks.push(...filteredLinks);
      filteredLinks
        .map((link: any) =>
          typeof link.target === 'object' ? link.target : nodesById[link.target],
        )
        .forEach(traverseTree);
    })();
    return { nodes: visibleNodes, links: visibleLinks };
  };
  const [prunedTree, setPrunedTree] = useState(getPrunedTree());
  const imageNodes = useMemo(
    () => prunedTree.nodes.filter(node => node.type === 'image' && node.hash),
    [prunedTree.nodes],
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
          width: GRAPH_THUMB_SIZE,
          height: GRAPH_THUMB_SIZE,
          dpr: 1 as const,
          mode: ResizeMode.Original,
        };
        const key = getThumbnailKey(request);
        if (node.thumbKey !== key) {
          node.thumbKey = key;
          node.url = undefined;
        }

        const url = getThumbnailUrl(request).url;
        if (url !== undefined) {
          node.url = convertFileSrc(url);
          node.key = getThumbnailKey(request);
        }
        return { ...request, key };
      });

    if (requests.length === 0) return;

    void ensureThumbnails(requests);
  }, [ensureThumbnails, getThumbnailKey, imageNodes]);

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
      },
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (fgRef && fgRef.current) {
      const fg = fgRef.current;
      fg.d3Force(
        'radial',
        d3
          .forceRadial(
            (d: any) => {
              if (d.nodeId == rootNodeId) return 0;
              return d.depth * GAP;
            },
            0,
            0,
          )
          .strength((d: any) => {
            return 0;
          }),
      );
      fg.d3Force('charge')?.strength(-50);
      fg.d3Force('link')
        ?.distance((l: any) =>
          Math.abs((l.source.depth ?? 0) - (l.target.depth ?? 0)) <= 1 ? 40 : 110,
        )
        .strength(0.6);
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
    let refreshFrame: number | null = null;
    const frame = requestAnimationFrame(() => {
      clearNodeSpriteCaches();
      setLinkStroke(getGraphPalette().link);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (refreshFrame !== null) {
        cancelAnimationFrame(refreshFrame);
      }
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
          NodeRenderer(node.type)?.(
            ctx,
            {
              x: node.x || 0,
              y: node.y || 0,
              size: node.size,
              label: node.label,
              url: node.url,
              thumbKey: node.thumbKey,
            },
            globalScale,
          );
        }}
        onNodeClick={node => {
          node.collapsed = false;
          setPrunedTree(getPrunedTree());
          node.id &&
            openNode({
              nodeId: node.nodeId,
              name: node.id + '',
            });
        }}
      />
    </div>
  );
};

export default GraphView;

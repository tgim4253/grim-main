import usePanelsStore from '@tgim/stores/panelStore';
import { Connection, GraphConnection, GraphData, GraphNode } from '@tgim/types/graph';
import { NodeRenderer, clearNodeSpriteCaches, getGraphPalette } from '@tgim/ui/index';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const KIND_GROUP_THRESHOLD = 5;

type AggregatedGroupMeta = {
  id: string;
  parentId: string;
  kind: string;
  count: number;
  displayLabel: string;
  aggregatorNode: GraphNode;
  aggregatorLink: GraphConnection;
  originalLinkKeys: Set<string>;
  virtualChildLinks: GraphConnection[];
};

const resolveNodeReference = (ref: unknown): string => {
  if (typeof ref === 'string') return ref;
  if (typeof ref === 'number') return ref.toString();
  if (ref && typeof ref === 'object' && 'id' in ref) {
    const { id } = ref as { id?: string | number };
    if (typeof id === 'string') return id;
    if (typeof id === 'number') return id.toString();
  }
  return '';
};

const linkKey = (link: GraphConnection) =>
  `${resolveNodeReference(link.source)}-->${resolveNodeReference(link.target)}`;

const formatRelationLabel = (value?: string) => {
  if (!value) return 'Group';
  const normalized = value.replace(/[_-]+/g, ' ').trim();
  if (!normalized) return 'Group';
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const calculateGroupSize = (baseSize: number, count: number) => {
  const base = Math.max(16, baseSize * 0.75);
  const growth = Math.log2(count + 1) * 6;
  return Math.min(48, base + growth);
};

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
  const { nodesById, aggregatedGroupsByParent, aggregatorIds } = useMemo(() => {
    const nodesMap: Record<string, GraphNode> = {};
    const groupsByParent: Record<string, AggregatedGroupMeta[]> = {};
    const groupIds: string[] = [];

    graphData.nodes.forEach(node => {
      node.isHidden = node.isLeaf;
      node.childLinks = [];
      nodesMap[node.id] = node;
    });

    graphData.links.forEach(link => {
      const normalizedLink: GraphConnection = {
        source: resolveNodeReference(link.source),
        target: resolveNodeReference(link.target),
        label: link.label,
        data: link.data,
      };

      const sourceNode = nodesMap[normalizedLink.source];
      if (!sourceNode) return;

      if (!Array.isArray(sourceNode.childLinks)) {
        sourceNode.childLinks = [];
      }

      sourceNode.childLinks.push(normalizedLink);
    });

    Object.values(nodesMap).forEach(parent => {
      if (!Array.isArray(parent.childLinks) || parent.childLinks.length === 0) {
        return;
      }

      const grouped = new Map<string, GraphConnection[]>();

      parent.childLinks.forEach(link => {
        const kind = link.data?.kind;
        if (!kind) return;
        if (!grouped.has(kind)) {
          grouped.set(kind, []);
        }
        grouped.get(kind)!.push(link);
      });

      const metas: AggregatedGroupMeta[] = [];

      grouped.forEach((links, kind) => {
        if (links.length < KIND_GROUP_THRESHOLD) {
          return;
        }

        const aggregatorId = `${parent.id}::group::${kind}`;
        const count = links.length;
        const displayLabel = formatRelationLabel(links[0]?.label ?? kind);

        const aggregatorNode: GraphNode = {
          id: aggregatorId,
          nodeId: aggregatorId,
          label: displayLabel,
          size: calculateGroupSize(parent.size, count),
          type: 'cluster',
          depth: (parent.depth ?? 0) + 1,
          isLeaf: false,
          isHidden: false,
        };

        aggregatorNode.childLinks = [];
        aggregatorNode.isAggregate = true;
        aggregatorNode.groupKind = kind;
        aggregatorNode.groupCount = count;
        aggregatorNode.parentId = parent.id;

        const aggregatorLink: GraphConnection = {
          source: parent.id,
          target: aggregatorId,
          label: displayLabel,
          data: {
            id: `${links[0].data.id}::group::${aggregatorId}`,
            src_node_id: links[0].data.src_node_id,
            dst_node_id: aggregatorId,
            kind: links[0].data.kind,
            kind_rule_id: links[0].data.kind_rule_id,
            level: links[0].data.level,
          },
        };

        const virtualChildLinks: GraphConnection[] = [];
        links.forEach(link => {
          const targetId = resolveNodeReference(link.target);
          if (!targetId || !nodesMap[targetId]) {
            return;
          }
          virtualChildLinks.push({
            source: aggregatorId,
            target: targetId,
            label: link.label,
            data: link.data,
          });
        });

        const originalLinkKeys = new Set<string>(links.map(item => linkKey(item)));

        metas.push({
          id: aggregatorId,
          parentId: parent.id,
          kind,
          count,
          displayLabel,
          aggregatorNode,
          aggregatorLink,
          originalLinkKeys,
          virtualChildLinks,
        });

        nodesMap[aggregatorId] = aggregatorNode;
        groupIds.push(aggregatorId);
      });

      if (metas.length > 0) {
        groupsByParent[parent.id] = metas;
      }
    });

    return {
      nodesById: nodesMap,
      aggregatedGroupsByParent: groupsByParent,
      aggregatorIds: groupIds,
    };
  }, [graphData]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setExpandedGroups(prev => {
      if (aggregatorIds.length === 0) {
        return Object.keys(prev).length === 0 ? prev : {};
      }

      const next: Record<string, boolean> = {};
      let changed = false;

      aggregatorIds.forEach(id => {
        if (prev[id] !== undefined) {
          next[id] = prev[id];
        } else {
          next[id] = false;
          changed = true;
        }
      });

      if (!changed) {
        const prevKeys = Object.keys(prev);
        if (prevKeys.length !== aggregatorIds.length) {
          changed = true;
        } else {
          for (const key of prevKeys) {
            if (!(key in next)) {
              changed = true;
              break;
            }
          }
        }
      }

      return changed ? next : prev;
    });
  }, [aggregatorIds]);
  const { moaId } = useMoa(location);
  const { ensureThumbnails, getThumbnailKey, getThumbnailUrl } = useThumbnails({ moaId });

  const GAP = 90;

  const getPrunedTree = useCallback(() => {
    if (!rootGraphNodeId || !nodesById[rootGraphNodeId]) {
      return { nodes: [], links: [] };
    }

    const visibleNodes: GraphNode[] = [];
    const visibleLinks: GraphConnection[] = [];
    const visited = new Set<string>();

    const traverseTree = (nodeId: string) => {
      const node = nodesById[nodeId];
      if (!node || visited.has(nodeId)) return;

      visited.add(nodeId);
      visibleNodes.push(node);

      const groups = aggregatedGroupsByParent[nodeId] ?? [];
      const aggregatedKeys = new Set<string>();
      groups.forEach(group => {
        group.originalLinkKeys.forEach(key => aggregatedKeys.add(key));
      });

      const childLinks = Array.isArray(node.childLinks) ? node.childLinks : [];

      childLinks.forEach(link => {
        const key = linkKey(link);
        if (aggregatedKeys.has(key)) {
          return;
        }

        const targetId = resolveNodeReference(link.target);
        if (!targetId) return;
        const target = nodesById[targetId];
        if (!target || target.isHidden) return;

        visibleLinks.push(link);
        traverseTree(targetId);
      });

      groups.forEach(group => {
        const aggregatorNode = group.aggregatorNode;
        const expanded = expandedGroups[group.id] ?? false;

        aggregatorNode.groupCount = group.count;
        aggregatorNode.groupKind = group.kind;
        aggregatorNode.collapsed = !expanded;
        aggregatorNode.isHidden = false;
        aggregatorNode.childLinks = expanded ? group.virtualChildLinks : [];
        aggregatorNode.label = `${group.displayLabel} (${group.count})${expanded ? ' ▾' : ' ▸'}`;

        visibleLinks.push(group.aggregatorLink);
        traverseTree(group.id);
      });
    };

    traverseTree(rootGraphNodeId);
    return { nodes: visibleNodes, links: visibleLinks };
  }, [aggregatedGroupsByParent, expandedGroups, nodesById, rootGraphNodeId]);
  const [prunedTree, setPrunedTree] = useState(() => getPrunedTree());
  useEffect(() => {
    setPrunedTree(getPrunedTree());
  }, [getPrunedTree]);
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
              if (!isFinite(d.depth)) return 0;
              return d.depth * GAP;
            },
            0,
            0,
          )
          .strength((d: any) => {
            if (!d.isLeaf) return 0.9;
            else return 0;
          }),
      );
      fg.d3Force('charge')?.strength(-50);
      fg.d3Force('link')
        ?.distance((l: any) =>
          Math.abs((l.source.depth ?? 0) - (l.target.depth ?? 0)) <= 1 ? 40 : 110,
        )
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
          if ((node as GraphNode & { isAggregate?: boolean }).isAggregate) {
            setExpandedGroups(prev => ({
              ...prev,
              [node.id]: !(prev[node.id] ?? false),
            }));
            return;
          }

          node.collapsed = false;
          setPrunedTree(getPrunedTree());
          if (node.id) {
            openNode({
              nodeId: node.nodeId,
              name: `${node.id}`,
            });
          }
        }}
      />
    </div>
  );
};

export default GraphView;

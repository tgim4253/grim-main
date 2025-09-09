import usePanelsStore from '@tgim/stores/panelStore';
import { Connection, GraphConnection, GraphData } from '@tgim/types/graph';
import { NodeRenderer } from '@tgim/ui/index';
import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { useShallow } from 'zustand/shallow';
import * as d3 from 'd3-force';
import useThumbStore from '@tgim/stores/thumbStore';
import { useMoa } from '@tgim/hooks/useMoa';

interface Props {
  graphData: GraphData;
  rootNodeId: string;
  rootGraphNodeId: string;
}

const GraphView: React.FC<Props> = ({ graphData, rootNodeId, rootGraphNodeId }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);

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
  const { upsertThumb, thumb } = useThumbStore(
    useShallow(s => ({
      upsertThumb: s.upsert,
      thumb: s.byKey,
    })),
  );

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

  useEffect(() => {
    graphData.nodes.forEach(node => {
      if (node.type == 'image' && !node.url) {
      }
    });
  }, [moaId, graphData.nodes]);

  const GAP = 90;
  const LEAF_OFFSET = 10;

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
  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={prunedTree}
        nodeLabel="label"
        nodeAutoColorBy="group"
        // onEngineStop={() => openAllNode()}
        // linkDirectionalArrowLength={3.5}
        // linkDirectionalArrowRelPos={0.96}
        linkColor={() => '#f3f3f3'}
        linkWidth={0.1}
        linkCurvature={0}
        nodeCanvasObject={(node, ctx, globalScale) => {
          NodeRenderer(node.type)?.(
            ctx,
            {
              x: node.x || 0,
              y: node.y || 0,
              size: node.size,
              label: node.label,
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

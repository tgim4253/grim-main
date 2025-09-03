import usePanelsStore from '@tgim/stores/panelStore';
import { GraphData } from '@tgim/types/graph';
import { NodeRenderer } from '@tgim/ui/index';
import { use, useEffect, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { useShallow } from 'zustand/shallow';
import * as d3 from 'd3-force';

interface Props {
  graphData: GraphData;
}

const GraphView: React.FC<Props> = ({ graphData }) => {
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

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge')?.strength(-50);
      fgRef.current.d3Force(
        'collide',
        d3.forceCollide(node => {
          return node.size + 8; // node.size 속성값을 반지름으로 사용
        }),
      );
    }
  }, []);

  const { openNode } = usePanelsStore(useShallow(s => ({ openNode: s.addPanelWithoutContainer })));
  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeLabel="label"
        nodeAutoColorBy="group"
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={0.96}
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
          node.id &&
            openNode({
              nodeId: node.id,
              name: node.id + '',
            });
        }}
      />
    </div>
  );
};

export default GraphView;

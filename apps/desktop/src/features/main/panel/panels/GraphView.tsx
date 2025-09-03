import usePanelsStore from '@tgim/stores/panelStore';
import { GraphData } from '@tgim/types/graph';
import { NodeRenderer } from '@tgim/ui/index';
import { use, useEffect, useRef, useState } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import { useShallow } from 'zustand/shallow';

interface Props {
  graphData: GraphData;
}

const GraphView: React.FC<Props> = ({ graphData }) => {
  console.log(graphData);
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
      fgRef.current.d3Force('charge')?.strength(-150);
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
        nodeLabel="id"
        nodeAutoColorBy="group"
        linkDirectionalArrowLength={3.5}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.25}
        nodeCanvasObject={(node, ctx, globalScale) => {
          // @ts-ignore
          NodeRenderer.circleRenderer(ctx, node, globalScale);
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

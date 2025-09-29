import { useMoa } from '@tgim/hooks/useMoa';
import usePanelsStore from '@tgim/stores/panelStore';
import { GraphData, GraphNode } from '@tgim/types/graph';
import { GraphOption, GraphPreferences } from '@tgim/types/graph-settings';
import { Button, clearNodeSpriteCaches, getGraphPalette, NodeRenderer } from '@tgim/ui';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import * as d3 from 'd3-force';
import { useThumbnails } from '@tgim/hooks/useThumbnails';
import { useTheme } from '../../../../../theme/ThemeProvider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { GraphContext } from '@tgim/types/graph-panel';
import GraphSettingsModal from './GraphSettingsModal';
import { useGraphFiltering } from '@tgim/hooks/graph/useGraphFiltering';
import { useGraphThumbnails } from '@tgim/hooks/graph/useGraphThumbnails';

interface Props {
  graphData: GraphData;
  rootNodeId: string;
  rootGraphNodeId: string;
  graphContext: GraphContext;
  graphPreferences: GraphPreferences;
  graphOption: GraphOption;
  onGraphOptionChange: (updater: (prev: GraphOption) => GraphOption) => void;
  onPreferencesChange: (updater: (prev: GraphPreferences) => GraphPreferences) => void;
  onSavePreferences: () => Promise<void> | void;
  settingsLoaded: boolean;
}

const GRAPH_THUMB_SIZE = 64;

const GraphView: React.FC<Props> = ({
  graphData,
  rootNodeId,
  rootGraphNodeId,
  graphContext,
  graphPreferences,
  graphOption,
  onGraphOptionChange,
  onPreferencesChange,
  onSavePreferences,
  settingsLoaded,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const { theme } = useTheme();
  const [linkStroke, setLinkStroke] = useState(() => getGraphPalette().link);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  const { moaId } = useMoa(location);
  const { ensureThumbnails, getThumbnailKey, getThumbnailUrl } = useThumbnails({ moaId });
  const { openNode } = usePanelsStore(
    useShallow(state => ({ openNode: state.addPanelWithoutContainer })),
  );

  const dimensions = useContainerDimensions(containerRef);

  const {
    prunedTree,
    setPrunedTree,
    getPrunedTree,
    incomingByTarget,
  } = useGraphFiltering({
    graphData,
    rootGraphNodeId,
    graphOption,
    graphContext,
  });

  useGraphThumbnails({
    nodes: prunedTree.nodes,
    ensureThumbnails,
    getThumbnailKey,
    getThumbnailUrl,
    refresh: () => setPrunedTree(getPrunedTree()),
    size: GRAPH_THUMB_SIZE,
  });

  useForceGraphConfiguration(fgRef);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      clearNodeSpriteCaches();
      setLinkStroke(getGraphPalette().link);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [theme]);

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      node.collapsed = false;
      setPrunedTree(getPrunedTree());
      node.id &&
        openNode({
          nodeId: node.nodeId,
          name: node.id + '',
        });
    },
    [getPrunedTree, openNode, setPrunedTree],
  );

  const handleSavePreferences = useCallback(async () => {
    try {
      setSavingPreferences(true);
      await onSavePreferences();
      setSettingsOpen(false);
    } finally {
      setSavingPreferences(false);
    }
  }, [onSavePreferences]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full transition-colors"
      style={{ background: 'var(--ds-graph-canvas)' }}
    >
      <div className="pointer-events-auto absolute right-4 top-4 z-10 flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSettingsOpen(true)}
          disabled={!settingsLoaded}
        >
          그래프 설정
        </Button>
      </div>
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={prunedTree}
        backgroundColor="rgba(0,0,0,0)"
        nodeLabel="label"
        nodeAutoColorBy="group"
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
        onNodeClick={handleNodeClick}
      />
      <GraphSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        graphPreferences={graphPreferences}
        graphOption={graphOption}
        graphContext={graphContext}
        onGraphOptionChange={onGraphOptionChange}
        onPreferencesChange={onPreferencesChange}
        onSave={handleSavePreferences}
        saving={savingPreferences}
        settingsLoaded={settingsLoaded}
      />
    </div>
  );
};

export default GraphView;

function useContainerDimensions(containerRef: React.RefObject<HTMLDivElement>) {
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
  }, [containerRef]);

  return dimensions;
}

function useForceGraphConfiguration(ref: React.MutableRefObject<ForceGraphMethods | undefined>) {
  useEffect(() => {
    if (!ref.current) return;
    const fg = ref.current;

    fg.d3Force(
      'radial',
      d3
        .forceRadial(
          (d: any) => {
            if (!isFinite(d.depth)) return 0;
            return d.depth * 90;
          },
          0,
          0,
        )
        .strength((d: any) => {
          if (!d.isLeaf) return 0.9;
          return 0;
        }),
    );
    fg.d3Force('charge')?.strength(-50);
    fg
      .d3Force('link')
      ?.distance((l: any) =>
        Math.abs((l.source.depth ?? 0) - (l.target.depth ?? 0)) <= 1 ? 40 : 110,
      )
      .strength(0.6);
    fg.d3Force('collide', d3.forceCollide(10));
  }, [ref]);
}

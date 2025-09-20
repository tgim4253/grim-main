import { useEffect, useState } from 'react';
import { ipc } from '../../lib/ipc';
import TitleBar from './layout/TitleBar';
import { platform } from '@tauri-apps/plugin-os';
import SidebarTabs from './layout/sidebar/SidebarTabs';
import SidebarPanel from './layout/sidebar/SidebarPanel';
import { Split } from '@tgim/ui/Splitter';
import useSidebarStore from '@tgim/stores/sidebarStore';
import { useShallow } from 'zustand/shallow';
import useFileTreeStore from '@tgim/stores/fileTreeStore';
import { useMoa } from '@tgim/hooks';
import ProgressWindow from './ProgressWindow';

import usePanelsStore from '@tgim/stores/panelStore';
import PanelContainer from './panel/Container';
import { useTheme } from '../../theme/ThemeProvider';
import { ensureThumbEventListener, disposeThumbEventListener } from '../../hooks/thumbs';

interface LayoutPorps {
  layoutId: string;
}
// Recursively render nested splits declared in the layout store.
const Layout: React.FC<LayoutPorps> = ({ layoutId }) => {
  const { containers, layout: layoutData } = usePanelsStore(
    useShallow(s => ({
      containers: s.containers,
      layout: s.layout[layoutId],
    })),
  );

  if (!layoutData) return null;

  return (
    <Split position={layoutData.axis}>
      {(
        { Panel }, // render prop
      ) =>
        layoutData.children.map(childId => {
          const container = containers[childId];
          if (container) {
            return (
              <Panel key={childId}>
                <PanelContainer containerId={childId} />
              </Panel>
            );
          }

          // nested split lives inside this panel
          return (
            <Panel key={childId}>
              <Layout layoutId={childId} />
            </Panel>
          );
        })
      }
    </Split>
  );
};

// Bootstraps the main workspace once backend bootstrap has finished.
const Main: React.FC = () => {
  const { moaId } = useMoa(location);
  const { theme } = useTheme();
  const [progress, setProgress] = useState<AppProgressEvent>({
    stage: 'Migrating',
    percent: 0,
    note: 'Initializing...',
  });
  const [progressQueue, setProgressQueue] = useState<AppProgressEvent[]>([]);
  const [processing, setProcessing] = useState(false);
  const [ready, setReady] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const { rootLayoutId, layout } = usePanelsStore(
    useShallow(s => ({
      rootLayoutId: s.rootLayout?.id,
      layout: s.layout,
    })),
  );
  const rootLayout = layout[rootLayoutId ?? ''];

  useEffect(() => {
    if (progress.stage !== 'Ready') {
      setReady(false);
      return;
    }

    // Delay rendering to let the final progress frame settle.
    const timer = window.setTimeout(() => {
      setReady(true);
    }, 100);

    return () => window.clearTimeout(timer);
  }, [progress.stage]);

  useEffect(() => {
    if (processing || progressQueue.length === 0) {
      return;
    }

    let cancelled = false;
    const timers: number[] = [];
    const queue = [...progressQueue];

    setProcessing(true);

    const run = () => {
      const next = queue.shift();
      if (!next || cancelled) {
        setProcessing(false);
        return;
      }

      setProgress(next);
      setProgressQueue(prev => prev.slice(1));

      if (queue.length > 0) {
        const id = window.setTimeout(run, 50);
        timers.push(id);
      } else {
        setProcessing(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      timers.forEach(id => window.clearTimeout(id));
      setProcessing(false);
    };
  }, [processing, progressQueue]);

  const { setSidebarHidden, setSidebarSize } = useSidebarStore(
    useShallow(state => {
      return {
        setSidebarHidden: state.setHidden,
        setSidebarSize: state.setSize,
      };
    }),
  );

  const { convertToTreeData, setTreeData } = useFileTreeStore(
    useShallow(state => ({
      convertToTreeData: state.convertToTreeData,
      setTreeData: state.setTreeData,
    })),
  );

  const { leftSidebar } = useSidebarStore(
    useShallow(state => ({
      leftSidebar: state.sidebars.left,
    })),
  );
  // React to thumbnail worker updates to keep local caches in sync.
  useEffect(() => {
    if (!moaId) {
      return undefined;
    }

    let disposed = false;
    let unlisten: (() => void) | undefined;

    ensureThumbEventListener()
      .then(stop => {
        if (disposed) {
          stop();
          return;
        }
        unlisten = stop;
      })
      .catch(error => {
        console.error('Failed to bind thumbnail events', error);
      });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
        unlisten = undefined;
      } else {
        void disposeThumbEventListener();
      }
    };
  }, [moaId]);

  // Load the initial graph and subscribe to bootstrap progress events.
  useEffect(() => {
    if (!moaId) {
      return undefined;
    }

    let unlisten: (() => void) | undefined;

    const load = async () => {
      try {
        const data = await ipc.moa.bootsrapMoa(moaId);
        const treeData = convertToTreeData(data);
        setTreeData(treeData);
      } catch (error) {
        console.error('Failed to bootstrap MOA graph', error);
      }
    };

    void load();

    const initListener = async () => {
      unlisten = await listen<AppProgressEvent>(`bootstrap://progress/${moaId}`, event => {
        setProgressQueue(prev => [...prev, event.payload]);
      });
    };

    void initListener();

    return () => {
      unlisten?.();
    };
  }, [convertToTreeData, moaId, setTreeData]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const os = await platform();
        if (mounted) setIsMac(os === 'macos');
      } catch {
        if (mounted) setIsMac(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div
      className="flex flex-col w-full h-full bg-shell-base text-text overflow-hidden"
      data-theme={theme}
    >
      {!isMac && (
        <div className="fixed w-full top-0 z-50">
          <TitleBar />
        </div>
      )}
      <div className="h-8"></div>
      {ready ? (
        <div className="flex-1 w-full flex overflow-hidden">
          <SidebarTabs sidebarPosition="left" />

          <Split position="horizontal" className="w-full h-screen">
            {({ Panel }) => (
              <>
                {!leftSidebar.hidden ? (
                  <Panel
                    key="left"
                    canHidden
                    hiddenSize={leftSidebar.hiddenSize ?? leftSidebar.minSize}
                    minSize={leftSidebar.minSize}
                    initialSize={leftSidebar.size}
                    onHidden={hidden => setSidebarHidden('left', hidden)}
                    onSizeChange={size => setSidebarSize('left', size)}
                  >
                    <SidebarPanel sidebarPosition="left" />
                  </Panel>
                ) : null}

                <Panel key="center">{rootLayout && <Layout layoutId={rootLayout.id} />}</Panel>
              </>
            )}
          </Split>
        </div>
      ) : (
        <ProgressWindow progress={progress} />
      )}
    </div>
  );
};

export default Main;

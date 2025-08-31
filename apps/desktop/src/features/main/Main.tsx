import { use, useEffect, useState } from 'react';
import { Routes, Route, useSearchParams } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { ipc } from '../../lib/ipc';
import TitleBar from './layout/TitleBar';
import { platform } from '@tauri-apps/plugin-os';
import SidebarTabs from './layout/sidebar/SidebarTabs';
import SidebarPanel from './layout/sidebar/SidebarPanel';
import { Split, SplitPanel } from '@tgim/ui/Splitter';
import useSidebarStore from '@tgim/stores/sidebarStore';
import { useShallow } from 'zustand/shallow';
import useFileTreeStore from '@tgim/stores/fileTreeStore';
import { useMoa } from '@tgim/hooks';
import { listen } from '@tauri-apps/api/event';
import ProgressWindow from './ProgressWindow';

import { debounce } from 'lodash';
import usePanelsStore from '@tgim/stores/panelStore';
import PanelContainer from './panel/Container';

interface LayoutPorps {
  layoutId: string;
}
const Layout: React.FC<LayoutPorps> = ({ layoutId }) => {
  const {
    containers,
    layout: layoutData,
    splitContainer,
  } = usePanelsStore(
    useShallow(s => ({
      containers: s.containers,
      layout: s.layout[layoutId],
      splitContainer: s.splitContainer,
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
                <PanelContainer containerId={childId}></PanelContainer>
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

const Main: React.FC = () => {
  const { moaId } = useMoa(location);
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
    console.log(rootLayout);
  }, [rootLayout]);
  useEffect(() => {
    console.log(progress);
    if (progress.stage === 'Ready') {
      const timer = setTimeout(() => {
        setReady(true);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setReady(false);
    }
  }, [progress.stage]);

  useEffect(() => {
    if (processing || progressQueue.length === 0) return;

    setProcessing(true);

    const tick = () => {
      setProgressQueue(prev => {
        if (prev.length === 0) {
          setProcessing(false);
          return prev;
        }

        const [next, ...rest] = prev;
        setProgress(next);
        if (rest.length > 0) {
          setTimeout(tick, 50);
        } else {
          setProcessing(false);
        }

        return rest;
      });
    };

    tick();
  }, [progressQueue.length, processing]);

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

  useEffect(() => {
    if (!moaId) return;

    let unlisten: (() => void) | null = null;

    const load = async () => {
      try {
        const data = await ipc.moa.bootsrapMoa(moaId);
        const treeData = convertToTreeData(data);
        setTreeData(treeData);
      } catch (err) {
        console.error(err);
      }
    };

    load();

    const initListener = async () => {
      unlisten = await listen<AppProgressEvent>(
        `bootstrap://progress/${moaId}`,
        (event: { payload: AppProgressEvent }) => {
          setProgressQueue(prev => [...prev, event.payload]);
        },
      );
    };
    initListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, [moaId]);

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
    <div className="flex flex-col w-full h-full bg-background-6 overflow-hidden" data-theme="dark">
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

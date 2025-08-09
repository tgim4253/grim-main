import { useEffect, useState } from 'react';
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

const Main: React.FC = () => {
  const { setSidebarHidden, setSidebarSize } = useSidebarStore(
    useShallow(state => {
      return {
        setSidebarHidden: state.setHidden,
        setSidebarSize: state.setSize,
      };
    }),
  );

  const { leftSidebar } = useSidebarStore(
    useShallow(state => ({
      leftSidebar: state.sidebars.left,
    })),
  );
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const moa_id = queryParams.get('moa_id') as string;
    const load = async () => {
      try {
        const data = await ipc.moa.bootsrapMoa(moa_id);
        console.log(data);
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, []);

  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const os = platform();
    setIsMac(os === 'macos');
  }, []);

  return (
    <div className="flex w-full h-full bg-background-6 overflow-hidden" data-theme="dark">
      {!isMac && (
        <div className="fixed w-full top-0 z-50">
          <TitleBar />
        </div>
      )}
      <div className="h-full w-full flex overflow-hidden mt-8">
        <SidebarTabs sidebarPosition="left"></SidebarTabs>
        <Split position="horizontal" className="w-full h-screen">
          {!leftSidebar.hidden ? (
            <SplitPanel
              canHidden
              hiddenSize={leftSidebar.hiddenSize ?? leftSidebar.minSize}
              minSize={leftSidebar.minSize}
              initialSize={leftSidebar.size}
              onHidden={hidden => setSidebarHidden('left', hidden)}
              onSizeChange={size => setSidebarSize('left', size)}
            >
              <SidebarPanel sidebarPosition="left"></SidebarPanel>
            </SplitPanel>
          ) : null}

          <SplitPanel minSize={200}>hi~</SplitPanel>
        </Split>
      </div>
    </div>
  );
};

export default Main;

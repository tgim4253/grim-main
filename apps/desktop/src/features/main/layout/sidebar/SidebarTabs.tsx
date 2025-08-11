import { Button } from '@tgim/ui/index';
import * as Icons from 'lucide-react';
import { useSidebarStore } from '@tgim/stores/index';
import { shallow, useShallow } from 'zustand/shallow';
import { useCallback } from 'react';
import cn from '@tgim/utils/cn';

const SidebarTabs: React.FC<SidebarProps> = ({ sidebarPosition }) => {
  const { activeTab, tabs } = useSidebarStore(
    useShallow(state => ({
      activeTab: state.sidebars[sidebarPosition].activeTab,
      tabs: state.sidebars[sidebarPosition].tabs,
    })),
  );
  const setActiveTab = useCallback(
    (newTab: string) => useSidebarStore.getState().setActiveTab(sidebarPosition, newTab),
    [sidebarPosition],
  );
  const setHiddenPanel = useCallback(
    (hidden: boolean) => useSidebarStore.getState().setHidden(sidebarPosition, hidden),
    [sidebarPosition],
  );

  const toggleHiddenPanel = useCallback(
    () =>
      useSidebarStore
        .getState()
        .setHidden(sidebarPosition, !useSidebarStore.getState().sidebars[sidebarPosition].hidden),
    [sidebarPosition],
  );

  return (
    <div className="min-w-8 w-fit flex flex-col bg-sidebar-bg border-r border-t rounded-tr-md border-border-sidebar h-full overflow-hidden">
      {tabs.map(tab => {
        return (
          <Button
            variant="icon"
            key={tab.name}
            onClick={() => {
              if (!tab.name) return;
              if (tab.name == activeTab) {
                toggleHiddenPanel();
                return;
              }
              setActiveTab(tab.name);
              setHiddenPanel(false);
            }}
            className={cn(
              'p-2 w-full hover:text-icon-hover-sidebar hover:bg-sidebar-hover ',
              activeTab === tab.name ? 'selected bg-sidebar-hover' : 'text-icon-sidebar',
            )}
          >
            {<tab.icon />}
          </Button>
        );
      })}
    </div>
  );
};

export default SidebarTabs;

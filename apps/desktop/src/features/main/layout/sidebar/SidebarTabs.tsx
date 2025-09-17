import { Button } from '@tgim/ui/index';
import { useSidebarStore } from '@tgim/stores/index';
import { useShallow } from 'zustand/shallow';
import { useCallback } from 'react';
import cn from '@tgim/utils/cn';

// Vertical tab list that mirrors VS Code style sidebars.
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
    <div className="flex flex-col min-w-8 w-fit h-full overflow-hidden border-t border-r border-border-sidebar bg-sidebar text-text">
      {tabs.map(tab => {
        return (
          <Button
            variant="icon"
            key={tab.name}
            active={activeTab === tab.name}
            onClick={() => {
              if (!tab.name) return;
              if (tab.name === activeTab) {
                toggleHiddenPanel();
                return;
              }
              setActiveTab(tab.name);
              setHiddenPanel(false);
            }}
            className={cn(
              'w-full p-2 transition-colors hover:text-icon-hover-sidebar hover:bg-sidebar-hover',
              activeTab === tab.name ? 'text-icon-hover-sidebar' : 'text-icon-sidebar',
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

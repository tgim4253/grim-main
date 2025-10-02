import { create } from 'zustand';
import { Folder, Search, Settings } from 'lucide-react';

type TabKey = 'explorer' | 'search' | 'settings' | (string & {});

interface TabItem {
  name: TabKey;
  icon: React.ElementType;
}

interface SidebarPanelState {
  activeTab: TabKey;
  tabs: TabItem[];
  hidden: boolean;
  size: number; // px
  minSize: number; // px
  hiddenSize?: number; // px
}

type SidebarPosition = 'left' | 'right';
interface SidebarState {
  sidebars: Record<SidebarPosition, SidebarPanelState>;
  setActiveTab: (position: SidebarPosition, tab: TabKey) => void;
  toggleTab: (position: SidebarPosition, tab: TabKey) => void;
  setHidden: (position: SidebarPosition, hidden: boolean) => void;
  setSize: (position: SidebarPosition, size: number) => void;
}

const useSidebarStore = create<SidebarState>((set, _get) => ({
  sidebars: {
    left: {
      activeTab: 'explorer',
      hidden: false,
      tabs: [
        { name: 'explorer', icon: Folder },
        { name: 'search', icon: Search },
      ],
      size: 300,
      minSize: 200,
      hiddenSize: 100,
    },
    right: {
      activeTab: 'settings',
      hidden: false,
      tabs: [{ name: 'settings', icon: Settings }],
      size: 300,
      minSize: 200,
      hiddenSize: 100,
    },
  },
  setActiveTab: (position, tab) => {
    set(state => ({
      sidebars: {
        ...state.sidebars,
        [position]: {
          ...state.sidebars[position],
          activeTab: tab,
        },
      },
    }));
  },
  setHidden: (position, hidden) => {
    set(state => ({
      sidebars: {
        ...state.sidebars,
        [position]: {
          ...state.sidebars[position],
          hidden,
        },
      },
    }));
  },
  setSize: (position, size) => {
    set(state => ({
      sidebars: {
        ...state.sidebars,
        [position]: {
          ...state.sidebars[position],
          size,
        },
      },
    }));
  },

  toggleTab: (position, tab) => {
    set(state => {
      const current = state.sidebars[position].activeTab;
      return {
        sidebars: {
          ...state.sidebars,
          [position]: {
            ...state.sidebars[position],
            activeTab: current === tab ? null : tab,
          },
        },
      };
    });
  },
}));

export default useSidebarStore;

import { create } from 'zustand';
import type { AssetListSource } from '@tgim/types/library';

export type PanelOpenRequest =
  | {
      type: 'assetGrid';
      title: string;
      source: AssetListSource;
    }
  | {
      type: 'assetViewer';
      title: string;
      assetId: string;
    }
  | {
      type: 'recordDetail';
      title: string;
      recordId: string;
    };

export type PanelTab = {
  id: string;
  key: string;
} & PanelOpenRequest;

interface PanelsState {
  tabs: PanelTab[];
  activeTabId: string | null;
  selectedAssetIdsByTab: Record<string, string[]>;
  openTab: (request: PanelOpenRequest) => string;
  replaceTab: (tabId: string, request: PanelOpenRequest) => string;
  closeTab: (tabId: string) => void;
  focusTab: (tabId: string) => void;
  renameTab: (tabId: string, title: string) => void;
  setSelection: (tabId: string, assetIds: string[]) => void;
  clearSelection: (tabId: string) => void;
  reset: () => void;
}

const createTabId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `panel-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
};

const buildTabKey = (request: PanelOpenRequest) => {
  switch (request.type) {
    case 'assetGrid':
      switch (request.source.kind) {
        case 'allAssets':
          return 'asset-grid:all';
        case 'uncategorized':
          return 'asset-grid:uncategorized';
        case 'folder':
          return `asset-grid:folder:${request.source.folderId}`;
      }
      break;
    case 'assetViewer':
      return `asset-viewer:${request.assetId}`;
    case 'recordDetail':
      return `record-detail:${request.recordId}`;
  }
};

const createTab = (request: PanelOpenRequest): PanelTab => ({
  id: createTabId(),
  key: buildTabKey(request),
  ...request,
});

const usePanelsStore = create<PanelsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  selectedAssetIdsByTab: {},

  openTab: request => {
    const key = buildTabKey(request);
    const existing = get().tabs.find(tab => tab.key === key);
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }

    const tab = createTab(request);
    set(state => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
    return tab.id;
  },

  replaceTab: (tabId, request) => {
    const key = buildTabKey(request);
    const existing = get().tabs.find(tab => tab.key === key && tab.id !== tabId);
    if (existing) {
      set(state => ({
        tabs: state.tabs.filter(tab => tab.id !== tabId),
        activeTabId: existing.id,
      }));
      return existing.id;
    }

    const nextTab: PanelTab = {
      id: tabId,
      key,
      ...request,
    };

    set(state => ({
      tabs: state.tabs.map(tab => (tab.id === tabId ? nextTab : tab)),
      activeTabId: tabId,
      selectedAssetIdsByTab:
        request.type === 'assetGrid'
          ? state.selectedAssetIdsByTab
          : Object.fromEntries(
              Object.entries(state.selectedAssetIdsByTab).filter(([id]) => id !== tabId),
            ),
    }));

    return tabId;
  },

  closeTab: tabId => {
    set(state => {
      const nextTabs = state.tabs.filter(tab => tab.id !== tabId);
      const nextActiveId =
        state.activeTabId === tabId
          ? (nextTabs[nextTabs.length - 1]?.id ?? null)
          : state.activeTabId;
      const { [tabId]: _, ...restSelection } = state.selectedAssetIdsByTab;

      return {
        tabs: nextTabs,
        activeTabId: nextActiveId,
        selectedAssetIdsByTab: restSelection,
      };
    });
  },

  focusTab: tabId => {
    set({ activeTabId: tabId });
  },

  renameTab: (tabId, title) => {
    set(state => ({
      tabs: state.tabs.map(tab => (tab.id === tabId ? { ...tab, title } : tab)),
    }));
  },

  setSelection: (tabId, assetIds) => {
    set(state => ({
      selectedAssetIdsByTab: {
        ...state.selectedAssetIdsByTab,
        [tabId]: Array.from(new Set(assetIds)),
      },
    }));
  },

  clearSelection: tabId => {
    set(state => {
      const { [tabId]: _, ...restSelection } = state.selectedAssetIdsByTab;
      return { selectedAssetIdsByTab: restSelection };
    });
  },

  reset: () => {
    set({
      tabs: [],
      activeTabId: null,
      selectedAssetIdsByTab: {},
    });
  },
}));

export default usePanelsStore;

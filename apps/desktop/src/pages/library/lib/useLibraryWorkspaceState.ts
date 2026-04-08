import { useCallback, useEffect } from 'react';
import type { LibrarySnapshot, SessionSummary } from '../../../shared/types';
import {
  useExplorerStore,
  useWorkspaceTabsStore,
  type ExplorerSelection,
} from '../../../entities/library/model';
import { sourceFromSelection, titleForSource } from '../../../features/library/lib/helpers';
import type { AssetSummary } from '../../../shared/types';

type UseLibraryWorkspaceStateParams = {
  snapshot: LibrarySnapshot | null;
};

export function useLibraryWorkspaceState({ snapshot }: UseLibraryWorkspaceStateParams) {
  const selectedItem = useExplorerStore(state => state.selectedItem);
  const setSelectedItem = useExplorerStore(state => state.setSelectedItem);

  const tabs = useWorkspaceTabsStore(state => state.tabs);
  const activeTabId = useWorkspaceTabsStore(state => state.activeTabId);
  const openTab = useWorkspaceTabsStore(state => state.openTab);
  const closeTab = useWorkspaceTabsStore(state => state.closeTab);
  const renameTab = useWorkspaceTabsStore(state => state.renameTab);
  const selectedAssetIdsByTab = useWorkspaceTabsStore(state => state.selectedAssetIdsByTab);

  useEffect(() => {
    if (!snapshot || tabs.length > 0) {
      return;
    }

    openTab({
      type: 'assetGrid',
      title: 'All Assets',
      source: { kind: 'allAssets' },
    });
  }, [openTab, snapshot, tabs.length]);

  const openGrid = useCallback(
    (selection: ExplorerSelection) => {
      const source = sourceFromSelection(selection);
      setSelectedItem(selection);
      if (!source || !snapshot) {
        return;
      }

      openTab({
        type: 'assetGrid',
        title: titleForSource(source, snapshot.explorer.virtualFolders),
        source,
      });
    },
    [openTab, setSelectedItem, snapshot],
  );

  const openAsset = useCallback(
    (asset: AssetSummary) => {
      const tabId = openTab({
        type: 'assetViewer',
        title: asset.fileName,
        assetId: asset.id,
      });
      renameTab(tabId, asset.fileName);
    },
    [openTab, renameTab],
  );

  const openAssetById = useCallback(
    (assetId: string, title?: string) => {
      const tabId = openTab({
        type: 'assetViewer',
        title: title ?? 'Asset Viewer',
        assetId,
      });
      if (title) {
        renameTab(tabId, title);
      }
    },
    [openTab, renameTab],
  );

  const openRecord = useCallback(
    (recordId: string, title?: string) => {
      const nextTitle = title ?? 'Record Detail';
      const tabId = openTab({
        type: 'recordDetail',
        title: nextTitle,
        recordId,
      });
      renameTab(tabId, nextTitle);
    },
    [openTab, renameTab],
  );

  const openSessionDetail = useCallback(
    (session: SessionSummary) => {
      const nextTitle = session.title || 'Session Detail';
      const tabId = openTab({
        type: 'sessionDetail',
        title: nextTitle,
        sessionId: session.id,
      });
      renameTab(tabId, nextTitle);
    },
    [openTab, renameTab],
  );

  const openSessionPresetManager = useCallback(() => {
    openTab({
      type: 'sessionPresetManager',
      title: 'Session Presets',
    });
  }, [openTab]);

  const openTagManager = useCallback(() => {
    openTab({
      type: 'tagManager',
      title: 'Tags',
    });
  }, [openTab]);

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? null;
  const fallbackSelectionTab = [...tabs]
    .reverse()
    .find(tab => tab.type === 'assetGrid' && (selectedAssetIdsByTab[tab.id] ?? []).length > 0);
  const selectedAssetIds =
    activeTab?.type === 'assetGrid'
      ? (selectedAssetIdsByTab[activeTab.id] ?? [])
      : fallbackSelectionTab
        ? (selectedAssetIdsByTab[fallbackSelectionTab.id] ?? [])
        : [];
  const selectedFolderId = selectedItem.kind === 'folder' ? selectedItem.folderId : null;

  return {
    activeTabId,
    closeTab,
    openAsset,
    openAssetById,
    openGrid,
    openRecord,
    openSessionDetail,
    openSessionPresetManager,
    openTagManager,
    selectedAssetIds,
    selectedFolderId,
    selectedItem,
    setSelectedItem,
    tabs,
  };
}

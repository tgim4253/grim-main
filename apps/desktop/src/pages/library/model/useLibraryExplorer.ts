import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '@/shared/lib/error';
import { ipc } from '@/shared/lib/ipc';
import type { AssetListSource, ExplorerSnapshot } from '@/shared/types';
import {
  ALL_ASSETS_NODE_ID,
  DEFAULT_ASSET_SOURCE,
  RECENT_RECORDS_NODE_ID,
  buildExplorerNodes,
  type ExplorerCreateFolderRequest,
  type ExplorerNode,
} from '@/features/library-explorer';
import type { WorkspaceView } from './libraryWorkspaceView';

export function useLibraryExplorer() {
  const { t } = useTranslation('common');
  const [explorerSnapshot, setExplorerSnapshot] = useState<ExplorerSnapshot | null>(null);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [isExplorerLoading, setIsExplorerLoading] = useState(true);
  const [activeExplorerNodeId, setActiveExplorerNodeId] = useState(ALL_ASSETS_NODE_ID);
  const [assetSource, setAssetSource] = useState<AssetListSource>(DEFAULT_ASSET_SOURCE);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('references');

  const explorerNodes = useMemo(
    () => buildExplorerNodes(explorerSnapshot, t),
    [explorerSnapshot, t],
  );
  const assignableFolderIds = useMemo(() => {
    const nextIds = new Set<string>();

    for (const stats of explorerSnapshot?.folderStats ?? []) {
      if (stats.childCount === 0) {
        nextIds.add(stats.folderId);
      }
    }

    return nextIds;
  }, [explorerSnapshot]);
  const assignableFolders = useMemo(
    () =>
      (explorerSnapshot?.virtualFolders ?? []).filter(folder => assignableFolderIds.has(folder.id)),
    [assignableFolderIds, explorerSnapshot],
  );
  const assignableFolderById = useMemo(
    () => new Map(assignableFolders.map(folder => [folder.id, folder])),
    [assignableFolders],
  );

  const loadExplorerSnapshot = useCallback(async () => {
    setIsExplorerLoading(true);
    setExplorerError(null);

    try {
      const snapshot = await ipc.library.loadExplorerSnapshot();
      setExplorerSnapshot(snapshot);
    } catch (error) {
      setExplorerError(
        getErrorMessage(
          error,
          t('explorer.error.load', { defaultValue: 'Failed to load explorer.' }),
        ),
      );
    } finally {
      setIsExplorerLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadExplorerSnapshot();
  }, [loadExplorerSnapshot]);

  const handleExplorerNodeSelect = useCallback((node: ExplorerNode) => {
    if (node.view === 'records') {
      setActiveExplorerNodeId(node.id);
      setWorkspaceView('records');
      return;
    }

    if (!node.source) {
      return;
    }

    setActiveExplorerNodeId(node.id);
    setAssetSource(node.source);
    setWorkspaceView('references');
  }, []);

  const handleCreateExplorerFolder = useCallback(
    async ({ parentId, name }: ExplorerCreateFolderRequest) => {
      await ipc.folder.save({ name, parentId });
      await loadExplorerSnapshot();
    },
    [loadExplorerSnapshot],
  );

  const openRecentRecords = useCallback(() => {
    setActiveExplorerNodeId(RECENT_RECORDS_NODE_ID);
    setWorkspaceView('records');
  }, []);

  return {
    explorerSnapshot,
    explorerNodes,
    explorerError,
    isExplorerLoading,
    activeExplorerNodeId,
    assetSource,
    workspaceView,
    assignableFolders,
    assignableFolderById,
    loadExplorerSnapshot,
    setWorkspaceView,
    handleExplorerNodeSelect,
    handleCreateExplorerFolder,
    openRecentRecords,
  };
}

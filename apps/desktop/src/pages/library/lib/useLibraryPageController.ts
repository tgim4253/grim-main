import { useCallback, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ipc } from '../../../shared/lib/ipc';
import type {
  AssetDetail,
  CroquisRecordDetail,
  SaveVirtualFolderPayload,
} from '../../../shared/types';
import { findFolderById, normaliseDialogPaths } from '../../../features/library/lib/helpers';
import type { FolderEditorState } from '../../../features/library/modals/FolderEditorModal';
import { useLibrarySnapshotState } from './useLibrarySnapshotState';
import { useLibraryWorkspaceState } from './useLibraryWorkspaceState';

type ImportPlan = {
  mode: 'import' | 'link';
  filePaths: string[];
  initialFolderIds: string[];
};

export type LibraryPageController = ReturnType<typeof useLibraryPageController>;

export function useLibraryPageController() {
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);
  const [folderEditor, setFolderEditor] = useState<FolderEditorState | null>(null);
  const [assetFolderTarget, setAssetFolderTarget] = useState<AssetDetail | null>(null);
  const [assetTagTarget, setAssetTagTarget] = useState<AssetDetail | null>(null);
  const [recordTagTarget, setRecordTagTarget] = useState<CroquisRecordDetail | null>(null);
  const [croquisOpen, setCroquisOpen] = useState(false);

  const { error, folders, loading, refreshSnapshot, refreshToken, snapshot } =
    useLibrarySnapshotState();
  const {
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
  } = useLibraryWorkspaceState({ snapshot });

  const launchImageImport = useCallback(async () => {
    const selected = normaliseDialogPaths(
      await open({
        multiple: true,
        directory: false,
        filters: [
          {
            name: 'Images',
            extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'],
          },
        ],
      }),
    );

    if (selected.length === 0) {
      return;
    }

    setImportPlan({
      mode: 'import',
      filePaths: selected,
      initialFolderIds: selectedFolderId ? [selectedFolderId] : [],
    });
  }, [selectedFolderId]);

  const launchExternalLink = useCallback(async () => {
    const selected = normaliseDialogPaths(
      await open({
        multiple: true,
        directory: false,
        filters: [
          {
            name: 'External Work Files',
            extensions: ['clip', 'psd', 'psb'],
          },
        ],
      }),
    );

    if (selected.length === 0) {
      return;
    }

    setImportPlan({
      mode: 'link',
      filePaths: selected,
      initialFolderIds: selectedFolderId ? [selectedFolderId] : [],
    });
  }, [selectedFolderId]);

  const createManualRecord = useCallback(async () => {
    const detail = await ipc.record.save({
      title: 'Manual Record',
      note: '',
      tagIds: [],
    });
    await refreshSnapshot();
    openRecord(detail.id, detail.title || 'Manual Record');
  }, [openRecord, refreshSnapshot]);

  const deleteSelectedFolder = useCallback(async () => {
    if (!selectedFolderId) {
      return;
    }

    const target = findFolderById(folders, selectedFolderId);
    const shouldDelete = window.confirm(
      `Delete "${target?.fullPath ?? 'selected folder'}" and its nested structure?`,
    );
    if (!shouldDelete) {
      return;
    }

    await ipc.folder.delete({ folderId: selectedFolderId });
    setSelectedItem({ kind: 'allAssets' });
    await refreshSnapshot();
    openGrid({ kind: 'allAssets' });
  }, [folders, openGrid, refreshSnapshot, selectedFolderId, setSelectedItem]);

  const openNewFolderEditor = useCallback(() => {
    setFolderEditor({ parentId: selectedFolderId });
  }, [selectedFolderId]);

  const openSelectedFolderEditor = useCallback(() => {
    if (!selectedFolderId) {
      return;
    }
    const folder = findFolderById(folders, selectedFolderId);
    if (!folder) {
      return;
    }
    setFolderEditor({ folder });
  }, [folders, selectedFolderId]);

  const deleteRecordAndRefresh = useCallback(
    (recordId: string) => {
      const targetTabId = tabs.find(
        tab => tab.type === 'recordDetail' && tab.recordId === recordId,
      )?.id;
      if (targetTabId) {
        closeTab(targetTabId);
      }
      void refreshSnapshot();
    },
    [closeTab, refreshSnapshot, tabs],
  );

  const confirmImportPlan = useCallback(
    async (folderIds: string[]) => {
      if (!importPlan) {
        return;
      }

      const payload = {
        filePaths: importPlan.filePaths,
        virtualFolderIds: folderIds,
        tagIds: [],
      };

      if (importPlan.mode === 'link') {
        await ipc.import.linkExternalFiles(payload);
      } else {
        await ipc.import.importImages(payload);
      }

      await refreshSnapshot();
      if (folderIds[0]) {
        openGrid({ kind: 'folder', folderId: folderIds[0] });
      } else {
        openGrid({ kind: 'allAssets' });
      }
    },
    [importPlan, openGrid, refreshSnapshot],
  );

  const confirmAssetFolders = useCallback(
    async (folderIds: string[]) => {
      if (!assetFolderTarget) {
        return;
      }

      await ipc.asset.updateFolders({
        assetId: assetFolderTarget.id,
        virtualFolderIds: folderIds,
      });
      await refreshSnapshot();
    },
    [assetFolderTarget, refreshSnapshot],
  );

  const confirmAssetTags = useCallback(
    async (tagIds: string[]) => {
      if (!assetTagTarget) {
        return;
      }

      await ipc.asset.updateTags({
        assetId: assetTagTarget.id,
        tagIds,
      });
      await refreshSnapshot();
    },
    [assetTagTarget, refreshSnapshot],
  );

  const confirmRecordTags = useCallback(
    async (tagIds: string[]) => {
      if (!recordTagTarget) {
        return;
      }

      await ipc.record.updateTags({
        recordId: recordTagTarget.id,
        tagIds,
      });
      await refreshSnapshot();
    },
    [recordTagTarget, refreshSnapshot],
  );

  const saveFolderEditor = useCallback(
    async (payload: SaveVirtualFolderPayload) => {
      const result = await ipc.folder.save(payload);
      await refreshSnapshot();
      openGrid({ kind: 'folder', folderId: result.savedFolderId });
    },
    [openGrid, refreshSnapshot],
  );

  const handleCroquisStarted = useCallback(async () => {
    setCroquisOpen(false);
    await refreshSnapshot();
  }, [refreshSnapshot]);

  return {
    activeTabId,
    assetFolderTarget,
    assetTagTarget,
    closeCroquis: () => {
      setCroquisOpen(false);
    },
    closeFolderEditor: () => {
      setFolderEditor(null);
    },
    closeImportPlan: () => {
      setImportPlan(null);
    },
    closeTagTargets: {
      asset: () => {
        setAssetTagTarget(null);
      },
      record: () => {
        setRecordTagTarget(null);
      },
    },
    confirmAssetFolders,
    confirmAssetTags,
    confirmImportPlan,
    confirmRecordTags,
    createManualRecord,
    croquisOpen,
    deleteRecordAndRefresh,
    deleteSelectedFolder,
    error,
    folderEditor,
    folders,
    handleCroquisStarted,
    importPlan,
    launchExternalLink,
    launchImageImport,
    loading,
    openAsset,
    openAssetById,
    openAssetFolderPicker: setAssetFolderTarget,
    openAssetTagPicker: setAssetTagTarget,
    openGrid,
    openNewFolderEditor,
    openRecord,
    openRecordTagPicker: setRecordTagTarget,
    openSelectedFolderEditor,
    openSessionDetail,
    openSessionPresetManager,
    openTagManager,
    openCroquis: () => {
      setCroquisOpen(true);
    },
    recordTagTarget,
    refreshSnapshot,
    refreshToken,
    saveFolderEditor,
    selectedAssetIds,
    selectedFolderId,
    selectedItem,
    snapshot,
    tabs,
  };
}

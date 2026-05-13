import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '@/shared/lib/error';
import { ipc } from '@/shared/lib/ipc';
import type { AssetDetail, BatchUpdateAssetFoldersMode, VirtualFolder } from '@/shared/types';
import { getSelectableFolders } from './folderAction';

type FolderAction = {
  assetIds: string[];
  mode: BatchUpdateAssetFoldersMode;
};

type UseAssetFolderActionOptions = {
  loadAssets: () => Promise<void>;
  onExplorerRefresh?: () => Promise<void> | void;
  onAssetsUpdated: (updatedDetails: readonly AssetDetail[]) => void;
};

export function useAssetFolderAction({
  loadAssets,
  onExplorerRefresh,
  onAssetsUpdated,
}: UseAssetFolderActionOptions) {
  const { t } = useTranslation('common');
  const [folderAction, setFolderAction] = useState<FolderAction | null>(null);
  const [folderActionFolders, setFolderActionFolders] = useState<VirtualFolder[]>([]);
  const [folderActionFolderId, setFolderActionFolderId] = useState('');
  const [folderActionBusy, setFolderActionBusy] = useState(false);
  const [folderActionLoading, setFolderActionLoading] = useState(false);
  const [folderActionError, setFolderActionError] = useState<string | null>(null);
  const [assetActionBusy, setAssetActionBusy] = useState(false);
  const [assetActionError, setAssetActionError] = useState<string | null>(null);
  const folderActionLoadSequenceRef = useRef(0);

  const applyAssetFolderUpdate = useCallback(
    async (assetIds: string[], virtualFolderIds: string[], mode: BatchUpdateAssetFoldersMode) => {
      setAssetActionBusy(true);
      setAssetActionError(null);

      try {
        const updatedDetails = await ipc.asset.batchUpdateFolders({
          assetIds,
          virtualFolderIds,
          mode,
        });

        onAssetsUpdated(updatedDetails);
        await loadAssets();
        try {
          await onExplorerRefresh?.();
        } catch (refreshError) {
          setAssetActionError(
            getErrorMessage(
              refreshError,
              t('explorer.error.refresh', { defaultValue: 'Failed to refresh explorer.' }),
            ),
          );
        }
        return true;
      } catch (nextError) {
        setAssetActionError(
          getErrorMessage(
            nextError,
            t('references.error.update_asset_folders', {
              defaultValue: 'Failed to update asset folders.',
            }),
          ),
        );
        return false;
      } finally {
        setAssetActionBusy(false);
      }
    },
    [loadAssets, onAssetsUpdated, onExplorerRefresh, t],
  );

  const openFolderAction = useCallback(
    (action: FolderAction) => {
      const loadSequence = folderActionLoadSequenceRef.current + 1;
      folderActionLoadSequenceRef.current = loadSequence;

      setFolderAction(action);
      setFolderActionFolderId('');
      setFolderActionFolders([]);
      setFolderActionError(null);
      setFolderActionLoading(true);

      void ipc.library
        .loadExplorerSnapshot()
        .then(snapshot => {
          if (folderActionLoadSequenceRef.current !== loadSequence) {
            return;
          }

          setFolderActionFolders(getSelectableFolders(snapshot));
        })
        .catch((nextError: unknown) => {
          if (folderActionLoadSequenceRef.current !== loadSequence) {
            return;
          }

          setFolderActionError(
            getErrorMessage(
              nextError,
              t('folders.error.load', { defaultValue: 'Failed to load folders.' }),
            ),
          );
        })
        .finally(() => {
          if (folderActionLoadSequenceRef.current === loadSequence) {
            setFolderActionLoading(false);
          }
        });
    },
    [t],
  );

  const closeFolderAction = useCallback(() => {
    folderActionLoadSequenceRef.current += 1;
    setFolderAction(null);
    setFolderActionFolderId('');
    setFolderActionError(null);
    setFolderActionBusy(false);
    setFolderActionLoading(false);
  }, []);

  const applyFolderAction = useCallback(() => {
    if (!folderAction || !folderActionFolderId) {
      return;
    }

    setFolderActionBusy(true);
    setFolderActionError(null);

    void applyAssetFolderUpdate(
      folderAction.assetIds,
      [folderActionFolderId],
      folderAction.mode,
    ).then(updated => {
      setFolderActionBusy(false);
      if (updated) {
        closeFolderAction();
        return;
      }

      setFolderActionError(
        t('references.error.update_asset_folders', {
          defaultValue: 'Failed to update asset folders.',
        }),
      );
    });
  }, [applyAssetFolderUpdate, closeFolderAction, folderAction, folderActionFolderId, t]);

  const modalBusy = folderActionBusy || folderActionLoading || assetActionBusy;
  const selectDisabled = modalBusy || !folderActionFolderId || folderActionFolders.length === 0;

  return {
    assetActionBusy,
    assetActionError,
    folderAction,
    folderActionFolders,
    folderActionFolderId,
    folderActionModalBusy: modalBusy,
    folderActionSelectDisabled: selectDisabled,
    folderActionError,
    applyAssetFolderUpdate,
    openFolderAction,
    closeFolderAction,
    applyFolderAction,
    setFolderActionFolderId,
  };
}

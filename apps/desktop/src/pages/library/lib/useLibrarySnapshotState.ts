import { startTransition, useCallback, useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useExplorerStore } from '../../../entities/library/model';
import { ipc } from '../../../shared/lib/ipc';
import type { LibrarySnapshot } from '../../../shared/types';

export function useLibrarySnapshotState() {
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const setFolders = useExplorerStore(state => state.setFolders);

  const refreshSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const nextSnapshot = await ipc.library.loadSnapshot();
      startTransition(() => {
        setSnapshot(nextSnapshot);
        setFolders(nextSnapshot.explorer.virtualFolders);
      });
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load library');
    } finally {
      setLoading(false);
      setRefreshToken(token => token + 1);
    }
  }, [setFolders]);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    void (async () => {
      try {
        unlisten = await listen('capture://completed', () => {
          void refreshSnapshot();
        });
      } catch (error) {
        console.warn('Failed to register capture completion listener', error);
      }
    })();

    const handleFocus = () => {
      void refreshSnapshot();
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      unlisten?.();
      window.removeEventListener('focus', handleFocus);
    };
  }, [refreshSnapshot]);

  return {
    snapshot,
    loading,
    error,
    refreshToken,
    refreshSnapshot,
    folders: snapshot?.explorer.virtualFolders ?? [],
  };
}

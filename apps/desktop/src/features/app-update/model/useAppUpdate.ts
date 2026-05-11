import { isTauri } from '@tauri-apps/api/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DownloadEvent } from '@tauri-apps/plugin-updater';

export type AppUpdateStatus =
  | 'idle'
  | 'unsupported'
  | 'checking'
  | 'upToDate'
  | 'downloading'
  | 'installing'
  | 'restarting'
  | 'error';

export type AppUpdateState = {
  supported: boolean;
  status: AppUpdateStatus;
  currentVersion: string | null;
  latestVersion: string | null;
  downloadedBytes: number;
  contentLength: number | null;
  error: string | null;
};

const UPDATES_SUPPORTED = isTauri();

const INITIAL_STATE: AppUpdateState = {
  supported: UPDATES_SUPPORTED,
  status: UPDATES_SUPPORTED ? 'idle' : 'unsupported',
  currentVersion: null,
  latestVersion: null,
  downloadedBytes: 0,
  contentLength: null,
  error: null,
};

function describeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'settings.update_status.error';
}

async function loadCurrentVersion() {
  const { getVersion } = await import('@tauri-apps/api/app');
  return getVersion();
}

export function useAppUpdate(enabled: boolean) {
  const [state, setState] = useState<AppUpdateState>(INITIAL_STATE);

  useEffect(() => {
    if (!enabled || !UPDATES_SUPPORTED || state.currentVersion) {
      return;
    }

    const lifecycle = { cancelled: false };

    void (async () => {
      try {
        const currentVersion = await loadCurrentVersion();
        if (lifecycle.cancelled) {
          return;
        }

        setState(current => ({
          ...current,
          currentVersion,
        }));
      } catch (error) {
        if (lifecycle.cancelled) {
          return;
        }

        setState(current => ({
          ...current,
          error: current.error ?? describeError(error),
        }));
      }
    })();

    return () => {
      lifecycle.cancelled = true;
    };
  }, [enabled, state.currentVersion]);

  const checkForUpdates = useCallback(async () => {
    if (!UPDATES_SUPPORTED) {
      setState(current => ({
        ...current,
        status: 'unsupported',
        error: null,
      }));
      return;
    }

    setState(current => ({
      ...current,
      status: 'checking',
      latestVersion: null,
      downloadedBytes: 0,
      contentLength: null,
      error: null,
    }));

    try {
      const currentVersion = state.currentVersion ?? (await loadCurrentVersion());
      const [{ check }, { relaunch }] = await Promise.all([
        import('@tauri-apps/plugin-updater'),
        import('@tauri-apps/plugin-process'),
      ]);

      setState(current => ({
        ...current,
        currentVersion,
      }));

      const update = await check();
      if (!update) {
        setState(current => ({
          ...current,
          currentVersion,
          latestVersion: null,
          status: 'upToDate',
          downloadedBytes: 0,
          contentLength: null,
          error: null,
        }));
        return;
      }

      setState(current => ({
        ...current,
        currentVersion: update.currentVersion,
        latestVersion: update.version,
        status: 'downloading',
        downloadedBytes: 0,
        contentLength: null,
        error: null,
      }));

      await update.downloadAndInstall((event: DownloadEvent) => {
        setState(current => {
          switch (event.event) {
            case 'Started':
              return {
                ...current,
                status: 'downloading',
                downloadedBytes: 0,
                contentLength: event.data.contentLength ?? null,
              };
            case 'Progress':
              return {
                ...current,
                status: 'downloading',
                downloadedBytes: current.downloadedBytes + event.data.chunkLength,
              };
            case 'Finished':
              return {
                ...current,
                status: 'installing',
              };
          }
        });
      });

      setState(current => ({
        ...current,
        status: 'restarting',
      }));

      await relaunch();
    } catch (error) {
      setState(current => ({
        ...current,
        status: 'error',
        error: describeError(error),
      }));
    }
  }, [state.currentVersion]);

  const busy = useMemo(
    () =>
      state.status === 'checking' ||
      state.status === 'downloading' ||
      state.status === 'installing' ||
      state.status === 'restarting',
    [state.status],
  );

  return {
    ...state,
    checkForUpdates,
    busy,
  };
}

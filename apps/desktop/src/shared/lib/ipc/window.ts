import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

function resolveCurrentWindow() {
  if (!isTauri()) {
    return null;
  }

  return getCurrentWindow();
}

export const windowIpc = {
  minimize: async () => {
    const appWindow = resolveCurrentWindow();
    if (!appWindow) {
      return;
    }

    await appWindow.minimize();
  },
  maximize: async () => {
    const appWindow = resolveCurrentWindow();
    if (!appWindow) {
      return;
    }

    const maximized = await appWindow.isMaximized();
    if (maximized) {
      await appWindow.unmaximize();
      return;
    }

    await appWindow.maximize();
  },
  close: async () => {
    const appWindow = resolveCurrentWindow();
    if (!appWindow) {
      return;
    }

    await appWindow.close();
  },
};

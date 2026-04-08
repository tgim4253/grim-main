import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();

export const windowIpc = {
  minimize: () => appWindow.minimize(),
  maximize: async () => {
    const maximized = await appWindow.isMaximized();
    if (maximized) {
      await appWindow.unmaximize();
      return;
    }

    await appWindow.maximize();
  },
  close: () => appWindow.close(),
};

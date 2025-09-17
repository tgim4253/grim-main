import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { GraphResponse } from '@tgim/types/graph';
import { ThumbRequest, ThumbResponse } from '@tgim/types/file';
const appWindow = getCurrentWindow();

// Thin wrappers around Tauri invoke calls to keep React components lean.
const windowControllerIpc = {
  minimize: async () => {
    await appWindow.minimize();
  },
  maximize: async () => {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      await appWindow.unmaximize();
      return;
    }
    await appWindow.maximize();
  },
  close: async () => {
    await appWindow.close();
  },
};

const moaIpc = {
  loadMoas: async () => {
    return (await invoke('list_moas')) as { name: string; path: string; moa_id: string }[];
  },
  createMoa: async (data: {
    name: string;
    path: string;
  }): Promise<{ name: string; path: string; moaId: string }> => {
    return (await invoke('create_moa', { moa: data })) as {
      name: string;
      path: string;
      moaId: string;
    };
  },
  openMoa: async (moaId: string) => {
    await invoke('open_moa', { moaId });
  },
  bootsrapMoa: async (moaId: string): Promise<GraphResponse> => {
    return (await invoke('bootstrap_moa', { moaId })) as GraphResponse;
  },
};

const graphIpc = {
  createFolder: async (
    moaId: string,
    data: { name: string; path: string; parent_id: string },
  ): Promise<void> => {
    await invoke('create_folder', { moaId, data });
  },
  getGraphOne: async (moaId: string, nodeId: string): Promise<GraphResponse> => {
    return (await invoke('get_graph_one', { moaId, nodeId })) as GraphResponse;
  },
};

const fileIpc = {
  getThumbnails: async (moaId: string, data: ThumbRequest): Promise<ThumbResponse> => {
    return (await invoke('get_thumbnails', { data, moaId })) as ThumbResponse;
  },
};

export const ipc = {
  windowController: windowControllerIpc,
  moa: moaIpc,
  graph: graphIpc,
  file: fileIpc,
};

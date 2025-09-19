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
    const response = (await invoke('list_moas')) as {
      name: string;
      path: string;
      moa_id: string;
    }[];
    return response;
  },
  createMoa: async (data: {
    name: string;
    path: string;
  }): Promise<{ name: string; path: string; moaId: string }> => {
    const response = (await invoke('create_moa', { moa: data })) as {
      name: string;
      path: string;
      moaId: string;
    };
    return response;
  },
  openMoa: async (moaId: string) => {
    await invoke('open_moa', { moaId });
  },
  bootsrapMoa: async (moaId: string): Promise<GraphResponse> => {
    const response = (await invoke('bootstrap_moa', { moaId })) as GraphResponse;
    return response;
  },
};

const graphIpc = {
  createFolder: (moaId: string, data: { name: string; path: string; parent_id: string }) => {
    invoke('create_folder', { moaId, data });
  },
  getGraphOne: async (moaId: string, nodeId: string): Promise<GraphResponse> => {
    const response = await invoke('get_graph_one', { moaId, nodeId });
    return response as GraphResponse;
  },
};

const fileIpc = {
  getThumbnails: async (moaId: String, data: ThumbRequest) => {
    const response = await invoke('get_thumbnails', { data, moaId });
    return response as ThumbResponse;
  },
};

export const ipc = {
  windowController: windowControllerIpc,
  moa: moaIpc,
  graph: graphIpc,
  file: fileIpc,
};

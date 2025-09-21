import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { GraphResponse } from '@tgim/types/graph';
import { CreateFolderPayload, FolderPreview, ThumbRequest, ThumbResponse } from '@tgim/types/file';

const appWindow = getCurrentWindow();

// Thin wrappers around Tauri invoke calls to keep React components lean.
const windowControllerIpc = {
  minimize: () => appWindow.minimize(),
  maximize: async () => {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      await appWindow.unmaximize();
      return;
    }
    await appWindow.maximize();
  },
  close: () => appWindow.close(),
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
  createMoa: async (data: { name: string; path: string }) => {
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
  createFolder: async (moaId: string, data: CreateFolderPayload) => {
    await invoke('create_folder', { moaId, data });
  },
  getGraphOne: async (moaId: string, nodeId: string): Promise<GraphResponse> => {
    const response = await invoke('get_graph_one', { moaId, nodeId });
    return response as GraphResponse;
  },
};

const fileIpc = {
  getThumbnails: async (moaId: string, data: ThumbRequest) => {
    const response = await invoke('get_thumbnails', { data, moaId });
    return response as ThumbResponse;
  },
  previewFolderImport: async (path: string): Promise<FolderPreview> => {
    const response = await invoke('preview_folder_import', { path });
    return response as FolderPreview;
  },
};

export const ipc = {
  windowController: windowControllerIpc,
  moa: moaIpc,
  graph: graphIpc,
  file: fileIpc,
};

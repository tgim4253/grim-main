import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { GraphResponse } from '@tgim/types/graph';
import { ThumbJobStatus, ThumbRequest, ThumbResponse } from '@tgim/types/file';
const appWindow = getCurrentWindow();

const windowControllerIpc = {
  minimize() {
    appWindow.minimize();
  },
  async maximize() {
    const isMaximized = await appWindow.isMaximized();
    if (isMaximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  },
  close() {
    appWindow.close();
  },
};

const moaIpc = {
  async loadMoas() {
    const a = (await invoke('list_moas')) as { name: string; path: string; moa_id: string }[];
    return a;
  },
  async createMoa(data: {
    name: string;
    path: string;
  }): Promise<{ name: string; path: string; moaId: string }> {
    const response = (await invoke('create_moa', { moa: data })) as {
      name: string;
      path: string;
      moaId: string;
    };
    return response;
  },
  async openMoa(moaId: string) {
    await invoke('open_moa', { moaId });
  },
  async bootsrapMoa(moaId: string): Promise<GraphResponse> {
    const response = (await invoke('bootstrap_moa', { moaId })) as GraphResponse;
    return response;
  },
};

const graphIpc = {
  createFolder(moaId: string, data: { name: string; path: string; parent_id: string }) {
    invoke('create_folder', { moaId, data });
  },
  async getGraphOne(moaId: string, nodeId: string): Promise<GraphResponse> {
    const response = await invoke('get_graph_one', { moaId, nodeId });
    return response as GraphResponse;
  },
};

const fileIpc = {
  async getThumbnails(moaId: String, data: ThumbRequest) {
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

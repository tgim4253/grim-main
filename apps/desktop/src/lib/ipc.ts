import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { GraphResponse } from '@tgim/types/graph';
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
  fetchGraphOne(moaId: string, nodeId: string) {
    return invoke('fetch_graph_one', { moaId, nodeId }) as Promise<GraphResponse>;
  },
};

export const ipc = {
  windowController: windowControllerIpc,
  moa: moaIpc,
  graph: graphIpc,
};

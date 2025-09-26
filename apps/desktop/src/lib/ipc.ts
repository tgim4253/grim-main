import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { GraphResponse } from '@tgim/types/graph';
import {
  CreateFolderPayload,
  FileTypeExtensionGroup,
  FolderOptionUpdatePayload,
  FileDetail,
  FolderPreview,
  ThumbRequest,
  ThumbResponse,
  ThumbnailUsage,
} from '@tgim/types/file';
import {
  CroquisCaptureContext,
  CroquisCapturePreview,
  CroquisCapturePreviewPayload,
  CroquisOption,
  CroquisPreferences,
  CroquisSession,
  CroquisStartPayload,
  CroquisStartResponse,
} from '@tgim/types/croquis';
import { convertKeysToCamel } from '@tgim/utils/object';

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
    return convertKeysToCamel(response) as { name: string; path: string; moaId: string }[];
  },
  createMoa: async (data: { name: string; path: string }) => {
    const response = (await invoke('create_moa', { moa: data })) as {
      name: string;
      path: string;
      moa_id: string;
      last_opened_at?: number | null;
    };
    return convertKeysToCamel(response) as {
      name: string;
      path: string;
      moaId: string;
      lastOpenedAt?: number | null;
    };
  },
  openMoa: async (moaId: string) => {
    await invoke('open_moa', { moaId });
  },
  bootsrapMoa: async (moaId: string): Promise<GraphResponse> => {
    const response = (await invoke('bootstrap_moa', { moaId })) as GraphResponse;
    return convertKeysToCamel(response) as GraphResponse;
  },
};

const graphIpc = {
  createFolder: async (moaId: string, data: CreateFolderPayload) => {
    await invoke('create_folder', { moaId, data });
  },
  getGraphOne: async (moaId: string, nodeId: string): Promise<GraphResponse> => {
    const response = await invoke('get_graph_one', { moaId, nodeId });
    return convertKeysToCamel(response) as GraphResponse;
  },
};

const fileIpc = {
  getThumbnails: async (moaId: string, data: ThumbRequest) => {
    const response = await invoke('get_thumbnails', { data, moaId });
    return convertKeysToCamel(response) as ThumbResponse;
  },
  getFilePath: async (moaId: string, hash: string) => {
    const response = await invoke('get_file_path', { moaId, hash });
    return response as string;
  },
  previewFolderImport: async (path: string): Promise<FolderPreview> => {
    const response = await invoke('preview_folder_import', { path });
    return convertKeysToCamel(response) as FolderPreview;
  },
  syncFolder: async (moaId: string, virtualNodeId: string) => {
    await invoke('sync_folder_mount', { moaId, virtualNodeId });
  },
  updateFolderOptions: async (
    moaId: string,
    virtualNodeId: string,
    options: FolderOptionUpdatePayload,
  ) => {
    await invoke('update_folder_mount_options', { moaId, virtualNodeId, options });
  },
  importPanelDrop: async (payload: {
    moaId: string;
    virtualNodeId: string;
    urls?: string[];
    baseUrls?: string[];
    paths?: string[];
  }) => {
    await invoke('import_panel_drop', { payload });
  },
  listFileTypeExtensions: async (): Promise<FileTypeExtensionGroup[]> => {
    const response = await invoke('list_file_type_extensions');
    return response as FileTypeExtensionGroup[];
  },
  getFileDetail: async (moaId: string, hash: string): Promise<FileDetail> => {
    const response = await invoke('get_file_detail', { moaId, hash });
    return response as FileDetail;
  },
  linkFilePath: async (
    moaId: string,
    hash: string,
    payload: { path: string; replacePathId?: string | null },
  ): Promise<FileDetail> => {
    const response = await invoke('link_file_path', {
      moaId,
      hash,
      path: payload.path,
      replacePathId: payload.replacePathId ?? null,
    });
    return response as FileDetail;
  },
  removeFilePath: async (moaId: string, hash: string, filePathId: string): Promise<FileDetail> => {
    const response = await invoke('remove_file_path', { moaId, hash, filePathId });
    return response as FileDetail;
  },
  revealInExplorer: async (path: string): Promise<void> => {
    await invoke('reveal_file_in_explorer', { path });
  },
};

const thumbnailIpc = {
  getUsage: async (): Promise<ThumbnailUsage> => {
    const response = await invoke('get_thumbnail_usage');
    return convertKeysToCamel(response) as ThumbnailUsage;
  },
  clearDerived: async () => {
    await invoke('clear_thumbnail_cache');
  },
  clearBase: async () => {
    await invoke('clear_base_thumbnail_cache');
  },
};

const croquisIpc = {
  startSession: async (payload: CroquisStartPayload): Promise<CroquisStartResponse> => {
    const response = await invoke('start_croquis_session', { payload });
    return convertKeysToCamel(response) as CroquisStartResponse;
  },
  loadSession: async (sessionId: string): Promise<CroquisSession | null> => {
    const response = await invoke('load_croquis_session', { sessionId });
    return (convertKeysToCamel(response) as CroquisSession | null) ?? null;
  },
  loadPreferences: async (moaId: string): Promise<CroquisPreferences | null> => {
    const response = await invoke('load_croquis_option', { moaId });
    return (convertKeysToCamel(response) as CroquisPreferences | null) ?? null;
  },
  openCaptureOverlay: async (payload: { sessionId: string; moaId: string; hash: string }) => {
    await invoke('open_croquis_capture_overlay', { payload });
  },
  renderCapturePreview: async (
    payload: CroquisCapturePreviewPayload,
  ): Promise<CroquisCapturePreview> => {
    return await invoke('render_croquis_capture_preview', { ...payload });
  },
  confirmCapture: async (payload: { baseUrl: string; context: CroquisCaptureContext }) => {
    await invoke('confirm_croquis_capture', { ...payload });
  },
};

export const ipc = {
  windowController: windowControllerIpc,
  moa: moaIpc,
  graph: graphIpc,
  file: fileIpc,
  croquis: croquisIpc,
  thumbnail: thumbnailIpc,
};

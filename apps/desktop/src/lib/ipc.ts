import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { GraphResponse } from '@tgim/types/graph';
import { PanelPreferences } from '@tgim/types/panel-settings';
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
  CroquisOption,
  CroquisPreferences,
  CroquisSession,
  CroquisStartPayload,
  CroquisStartResponse,
} from '@tgim/types/croquis';
import {
  CaptureContext,
  CaptureOverlayPayload,
  CapturePreview,
  CapturePreviewPayload,
} from '@tgim/types/capture';
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

const panelIpc = {
  loadPreferences: async (moaId: string): Promise<PanelPreferences> => {
    const response = await invoke('load_panel_preferences', { moaId });
    return convertKeysToCamel(response) as PanelPreferences;
  },
  savePreferences: async (moaId: string, preferences: PanelPreferences): Promise<void> => {
    await invoke('save_panel_preferences', { moaId, preferences });
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
  expandPreferredUrls: async (url: string) => {
    const response = await invoke('expand_preferred_urls', { url });
    return response as string[];
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
    files?: {
      name: string;
      mimeType?: string | null;
      dataBase64: string;
    }[];
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
};

const captureIpc = {
  openOverlay: async (payload: CaptureOverlayPayload) => {
    await invoke('open_capture_overlay', { payload });
  },
  renderPreview: async (payload: CapturePreviewPayload): Promise<CapturePreview> => {
    return await invoke('render_capture_preview', { ...payload });
  },
  confirm: async (payload: { baseUrl: string; context: CaptureContext }) => {
    await invoke('confirm_capture', { ...payload });
  },
};

export const ipc = {
  windowController: windowControllerIpc,
  moa: moaIpc,
  graph: graphIpc,
  panel: panelIpc,
  file: fileIpc,
  croquis: croquisIpc,
  capture: captureIpc,
  thumbnail: thumbnailIpc,
};

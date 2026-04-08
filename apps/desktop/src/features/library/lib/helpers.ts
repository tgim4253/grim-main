import { convertFileSrc } from '@tauri-apps/api/core';
import type {
  AssetDetail,
  AssetListSource,
  AssetSummary,
  CroquisRecordSummary,
  SessionSummary,
  VirtualFolder,
} from '../../../shared/types';
import type { ExplorerSelection } from '../../../entities/library/model';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']);

export const getAssetExtension = (fileName: string) => {
  const segments = fileName.split('.');
  return segments.length > 1 ? (segments[segments.length - 1]?.toLowerCase() ?? '') : '';
};

export const isRenderableAsset = (
  asset: Pick<
    AssetSummary,
    'mimeType' | 'fileName' | 'thumbnailPath' | 'storagePath' | 'externalPath'
  >,
) => {
  if (asset.thumbnailPath) {
    return true;
  }

  if (asset.mimeType?.startsWith('image/')) {
    return true;
  }

  return IMAGE_EXTENSIONS.has(getAssetExtension(asset.fileName));
};

export const assetPreviewSrc = (
  asset: Pick<
    AssetSummary | AssetDetail,
    'thumbnailPath' | 'storagePath' | 'externalPath' | 'fileName' | 'mimeType'
  >,
) => {
  const rawPath = asset.thumbnailPath ?? asset.storagePath ?? asset.externalPath;
  if (!rawPath || !isRenderableAsset(asset)) {
    return null;
  }

  return convertFileSrc(rawPath);
};

export const formatDateTime = (value?: string | null) => {
  if (!value) {
    return 'Not set';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

export const formatDuration = (seconds?: number | null) => {
  if (!seconds || seconds <= 0) {
    return 'Free';
  }

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) {
    return `${String(remainder)}s`;
  }

  return `${String(minutes)}m ${remainder.toString().padStart(2, '0')}s`;
};

export const formatFileSize = (bytes?: number | null) => {
  if (!bytes || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  const fractionDigits = value >= 10 || index === 0 ? 0 : 1;
  return `${value.toFixed(fractionDigits)} ${units[index]}`;
};

export const normaliseDialogPaths = (value: string | string[] | null): string[] => {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value.filter(Boolean) : [value];
};

export const findFolderById = (folders: VirtualFolder[], folderId?: string | null) =>
  folderId ? (folders.find(folder => folder.id === folderId) ?? null) : null;

export const titleForSource = (source: AssetListSource, folders: VirtualFolder[]) => {
  switch (source.kind) {
    case 'allAssets':
      return 'All Assets';
    case 'uncategorized':
      return 'Uncategorized';
    case 'folder':
      return findFolderById(folders, source.folderId)?.fullPath ?? 'Virtual Folder';
  }
};

export const sourceFromSelection = (selection: ExplorerSelection): AssetListSource | null => {
  switch (selection.kind) {
    case 'allAssets':
      return { kind: 'allAssets' };
    case 'uncategorized':
      return { kind: 'uncategorized' };
    case 'folder':
      return { kind: 'folder', folderId: selection.folderId };
    default:
      return null;
  }
};

export const recordLabel = (record: CroquisRecordSummary) =>
  record.title || record.stepName || 'Untitled Record';

export const sessionLabel = (session: Pick<SessionSummary, 'title'>) =>
  session.title || 'Untitled Session';

export const labelForSelection = (selection: ExplorerSelection, folders: VirtualFolder[]) => {
  switch (selection.kind) {
    case 'allAssets':
      return 'All Assets';
    case 'uncategorized':
      return 'Uncategorized';
    case 'recentRecords':
      return 'Recent Records';
    case 'sessions':
      return 'Sessions';
    case 'folder':
      return findFolderById(folders, selection.folderId)?.fullPath ?? 'Virtual Folder';
    case 'record':
      return 'Record Detail';
    case 'session':
      return 'Session Detail';
  }
};

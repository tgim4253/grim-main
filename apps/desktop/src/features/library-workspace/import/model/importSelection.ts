import type { AssetListSource, VirtualFolder } from '@/shared/types';

export const SUPPORTED_IMPORT_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'bmp',
  'gif',
  'tif',
  'tiff',
];

function getSourceFolderId(source: AssetListSource) {
  return source.kind === 'folder' ? source.folderId : null;
}

export function getDefaultImportFolderId({
  assetSource,
  folderById,
}: {
  assetSource: AssetListSource;
  folderById: ReadonlyMap<string, VirtualFolder>;
}) {
  const activeFolderId = getSourceFolderId(assetSource);

  if (activeFolderId && folderById.has(activeFolderId)) {
    return activeFolderId;
  }

  return undefined;
}

export function normalizeSelectedFilePaths(filePaths: readonly string[]) {
  return [...new Set(filePaths.map(filePath => filePath.trim()).filter(Boolean))];
}

export function normalizeDialogSelection(selection: string | string[] | null) {
  if (!selection) {
    return [];
  }

  return Array.isArray(selection) ? selection : [selection];
}

import i18n from '../../../i18n';

export const MAX_DROP_IMAGE_BYTES = 50 * 1024 * 1024;
export const MAX_DROP_IMAGE_COUNT = 200;
const MAX_DROP_FILE_CANDIDATES = 1_000;

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
  gif: 'image/gif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

type DroppedFileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

type DroppedFileSystemFileEntry = DroppedFileSystemEntry & {
  file: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
};

type DroppedFileSystemDirectoryReader = {
  readEntries: (
    success: (entries: DroppedFileSystemEntry[]) => void,
    error?: (error: DOMException) => void,
  ) => void;
};

type DroppedFileSystemDirectoryEntry = DroppedFileSystemEntry & {
  createReader: () => DroppedFileSystemDirectoryReader;
};

type WebkitDataTransferItemLike = {
  webkitGetAsEntry?: () => DroppedFileSystemEntry | null;
};

export type DroppedImageFileCollection = {
  files: File[];
  oversizedCount: number;
  skippedCount: number;
  truncated: boolean;
  unsupportedCount: number;
};

export function hasFileDropData(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.types).includes('Files');
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.trim().toLowerCase() ?? '';
}

export function getImageMimeType(file: File) {
  const extensionMime = IMAGE_MIME_BY_EXTENSION[getFileExtension(file.name)];
  if (extensionMime) {
    return extensionMime;
  }

  const normalizedType = file.type.split(';')[0]?.trim().toLowerCase() ?? '';
  if (Object.values(IMAGE_MIME_BY_EXTENSION).includes(normalizedType)) {
    return normalizedType;
  }

  return null;
}

function isSupportedImageFile(file: File) {
  return getImageMimeType(file) !== null;
}

function isFileEntry(entry: DroppedFileSystemEntry): entry is DroppedFileSystemFileEntry {
  return entry.isFile && 'file' in entry;
}

function isDirectoryEntry(entry: DroppedFileSystemEntry): entry is DroppedFileSystemDirectoryEntry {
  return entry.isDirectory && 'createReader' in entry;
}

function readFileEntry(entry: DroppedFileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readDirectoryBatch(reader: DroppedFileSystemDirectoryReader) {
  return new Promise<DroppedFileSystemEntry[]>((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

async function readEntryFiles(entry: DroppedFileSystemEntry, files: File[]): Promise<boolean> {
  if (files.length >= MAX_DROP_FILE_CANDIDATES) {
    return true;
  }

  if (isFileEntry(entry)) {
    files.push(await readFileEntry(entry));
    return files.length >= MAX_DROP_FILE_CANDIDATES;
  }

  if (!isDirectoryEntry(entry)) {
    return false;
  }

  const reader = entry.createReader();
  let hasMoreEntries = true;

  while (hasMoreEntries) {
    const entries = await readDirectoryBatch(reader);
    if (entries.length === 0) {
      hasMoreEntries = false;
      continue;
    }

    for (const nestedEntry of entries) {
      const truncated = await readEntryFiles(nestedEntry, files);
      if (truncated) {
        return true;
      }
    }
  }

  return false;
}

function getDroppedEntry(item: DataTransferItem) {
  const getAsEntry = (item as WebkitDataTransferItemLike).webkitGetAsEntry;
  if (typeof getAsEntry !== 'function') {
    return null;
  }

  return getAsEntry.call(item);
}

async function collectDroppedFiles(dataTransfer: DataTransfer) {
  const entries = Array.from(dataTransfer.items)
    .filter(item => item.kind === 'file')
    .map(getDroppedEntry)
    .filter((entry): entry is DroppedFileSystemEntry => entry !== null);

  const files: File[] = [];
  let truncated = false;

  if (entries.length > 0) {
    for (const entry of entries) {
      truncated = (await readEntryFiles(entry, files)) || truncated;
      if (truncated) {
        break;
      }
    }
  } else {
    files.push(...Array.from(dataTransfer.files).slice(0, MAX_DROP_FILE_CANDIDATES));
    truncated = dataTransfer.files.length > MAX_DROP_FILE_CANDIDATES;
  }

  const seen = new Set<string>();
  const deduped = files.filter(file => {
    const key = `${file.name}:${String(file.size)}:${String(file.lastModified)}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  return { files: deduped, truncated };
}

export async function collectSupportedDroppedImageFiles(
  dataTransfer: DataTransfer,
): Promise<DroppedImageFileCollection> {
  const { files: droppedFiles, truncated } = await collectDroppedFiles(dataTransfer);
  const files: File[] = [];
  let oversizedCount = 0;
  let skippedCount = 0;
  let unsupportedCount = 0;

  for (const file of droppedFiles) {
    if (!isSupportedImageFile(file)) {
      unsupportedCount += 1;
      continue;
    }

    if (file.size > MAX_DROP_IMAGE_BYTES) {
      oversizedCount += 1;
      continue;
    }

    if (files.length >= MAX_DROP_IMAGE_COUNT) {
      skippedCount += 1;
      continue;
    }

    files.push(file);
  }

  return {
    files,
    oversizedCount,
    skippedCount,
    truncated,
    unsupportedCount,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }

  return btoa(binary);
}

export async function fileToDataImageSource(file: File) {
  const mimeType = getImageMimeType(file);
  if (!mimeType) {
    return null;
  }

  if (file.size > MAX_DROP_IMAGE_BYTES) {
    throw new Error(
      i18n.t('import.error.image_drop_limit', {
        fileName: file.name,
        limitMb: String(MAX_DROP_IMAGE_BYTES / 1024 / 1024),
        defaultValue: '{{fileName}} exceeds the {{limitMb}} MB image drop limit.',
      }),
    );
  }

  const encodedName = encodeURIComponent(file.name || 'dropped-image');
  const base64 = arrayBufferToBase64(await file.arrayBuffer());
  return `data:${mimeType};name=${encodedName};base64,${base64}`;
}

export function formatDroppedImageFileWarnings(collection: DroppedImageFileCollection) {
  const warnings: string[] = [];

  if (collection.unsupportedCount > 0) {
    warnings.push(
      i18n.t('import.warning.non_image_skipped', {
        count: collection.unsupportedCount,
        formattedCount: collection.unsupportedCount.toLocaleString(),
        defaultValue: '{{formattedCount}} non-image files skipped',
      }),
    );
  }

  if (collection.oversizedCount > 0) {
    warnings.push(
      i18n.t('import.warning.oversized_skipped', {
        count: collection.oversizedCount,
        formattedCount: collection.oversizedCount.toLocaleString(),
        limitMb: String(MAX_DROP_IMAGE_BYTES / 1024 / 1024),
        defaultValue: '{{formattedCount}} images over {{limitMb}} MB skipped',
      }),
    );
  }

  if (collection.skippedCount > 0) {
    warnings.push(
      i18n.t('import.warning.count_limit_skipped', {
        count: collection.skippedCount,
        formattedCount: collection.skippedCount.toLocaleString(),
        limit: MAX_DROP_IMAGE_COUNT.toLocaleString(),
        defaultValue: '{{formattedCount}} images skipped after the {{limit}} file limit',
      }),
    );
  }

  if (collection.truncated) {
    warnings.push(
      i18n.t('import.warning.folder_scan_stopped', {
        limit: MAX_DROP_FILE_CANDIDATES.toLocaleString(),
        defaultValue: 'folder scan stopped after {{limit}} files',
      }),
    );
  }

  return warnings.length > 0
    ? i18n.t('import.warning.joined', {
        warnings: warnings.join('; '),
        defaultValue: '{{warnings}}.',
      })
    : null;
}

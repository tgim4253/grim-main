import i18n from '../../../i18n';

export const MAX_DROP_IMAGE_BYTES = 50 * 1024 * 1024;
export const DROP_IMAGE_WARNING_THRESHOLD = 200;

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

export type DroppedFileDataSource =
  | {
      kind: 'entries';
      entries: DroppedFileSystemEntry[];
    }
  | {
      kind: 'files';
      files: File[];
    };

export type DroppedImageFileCollection = {
  files: File[];
  oversizedCount: number;
  unsupportedCount: number;
};

export type DroppedImageFileCandidateCount = {
  count: number;
  exact: boolean;
};

export function hasFileDropData(dataTransfer: DataTransfer) {
  const maybeFileDataTransfer = dataTransfer as { files?: FileList };

  return (
    Array.from(dataTransfer.types).includes('Files') ||
    (maybeFileDataTransfer.files?.length ?? 0) > 0
  );
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

function isSupportedImageFileName(fileName: string) {
  return Object.prototype.hasOwnProperty.call(IMAGE_MIME_BY_EXTENSION, getFileExtension(fileName));
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

async function readEntryFiles(entry: DroppedFileSystemEntry, files: File[]): Promise<void> {
  if (isFileEntry(entry)) {
    files.push(await readFileEntry(entry));
    return;
  }

  if (!isDirectoryEntry(entry)) {
    return;
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
      await readEntryFiles(nestedEntry, files);
    }
  }
}

function getDroppedEntry(item: DataTransferItem) {
  const getAsEntry = (item as WebkitDataTransferItemLike).webkitGetAsEntry;
  if (typeof getAsEntry !== 'function') {
    return null;
  }

  return getAsEntry.call(item);
}

export function createDroppedFileDataSource(dataTransfer: DataTransfer): DroppedFileDataSource {
  const entries = Array.from(dataTransfer.items)
    .filter(item => item.kind === 'file')
    .map(getDroppedEntry)
    .filter((entry): entry is DroppedFileSystemEntry => entry !== null);

  if (entries.some(entry => entry.isDirectory)) {
    return { kind: 'entries', entries };
  }

  const files = Array.from(dataTransfer.files);
  if (files.length > 0) {
    return { kind: 'files', files };
  }

  return entries.length > 0 ? { kind: 'entries', entries } : { kind: 'files', files };
}

function normalizeDroppedFileDataSource(source: DroppedFileDataSource | DataTransfer) {
  return 'kind' in source ? source : createDroppedFileDataSource(source);
}

type CandidateCounter = {
  count: number;
  limit: number;
};

function incrementCandidateCounter(counter: CandidateCounter) {
  counter.count += 1;
}

async function countEntryImageFileCandidates(
  entry: DroppedFileSystemEntry,
  counter: CandidateCounter,
): Promise<void> {
  if (counter.count >= counter.limit) {
    return;
  }

  if (isFileEntry(entry)) {
    if (isSupportedImageFileName(entry.name)) {
      incrementCandidateCounter(counter);
    }
    return;
  }

  if (!isDirectoryEntry(entry)) {
    return;
  }

  const reader = entry.createReader();
  let hasMoreEntries = true;

  while (hasMoreEntries && counter.count < counter.limit) {
    const entries = await readDirectoryBatch(reader);
    if (entries.length === 0) {
      hasMoreEntries = false;
      continue;
    }

    for (const nestedEntry of entries) {
      await countEntryImageFileCandidates(nestedEntry, counter);
      if (counter.count >= counter.limit) {
        return;
      }
    }
  }
}

export async function countDroppedImageFileCandidates(
  source: DroppedFileDataSource,
  limit: number,
): Promise<DroppedImageFileCandidateCount> {
  const counter = {
    count: 0,
    limit,
  };

  if (source.kind === 'files') {
    for (const file of source.files) {
      if (!isSupportedImageFile(file) || file.size > MAX_DROP_IMAGE_BYTES) {
        continue;
      }

      counter.count += 1;
    }

    return {
      count: counter.count,
      exact: true,
    };
  }

  for (const entry of source.entries) {
    await countEntryImageFileCandidates(entry, counter);
    if (counter.count >= limit) {
      break;
    }
  }

  return {
    count: counter.count,
    exact: counter.count < limit,
  };
}

async function collectDroppedFiles(source: DroppedFileDataSource) {
  const files: File[] = [];

  if (source.kind === 'entries') {
    for (const entry of source.entries) {
      await readEntryFiles(entry, files);
    }
  } else {
    files.push(...source.files);
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

  return deduped;
}

export async function collectSupportedDroppedImageFiles(
  source: DroppedFileDataSource | DataTransfer,
): Promise<DroppedImageFileCollection> {
  const droppedFiles = await collectDroppedFiles(normalizeDroppedFileDataSource(source));
  const files: File[] = [];
  let oversizedCount = 0;
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

    files.push(file);
  }

  return {
    files,
    oversizedCount,
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

  return warnings.length > 0
    ? i18n.t('import.warning.joined', {
        warnings: warnings.join('; '),
        defaultValue: '{{warnings}}.',
      })
    : null;
}

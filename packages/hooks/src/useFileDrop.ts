import { useCallback, useState } from 'react';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { ipc } from '../../../apps/desktop/src/lib/ipc';

interface UseFileDropParams {
  dropEnabled: boolean;
  rootNodeId: string | null;
  moaId: string | null;
  refreshPanelData: () => Promise<void>;
}

interface ExtractedDropData {
  urls: string[];
  baseUrls: string[];
}

interface FileDropFilePayload {
  name: string;
  mimeType?: string | null;
  dataBase64: string;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  jpeg: 'jpg',
  jpg: 'jpg',
  'image/png': 'png',
  png: 'png',
  'image/webp': 'webp',
  webp: 'webp',
  'image/gif': 'gif',
  gif: 'gif',
  'image/bmp': 'bmp',
  bmp: 'bmp',
  'image/svg+xml': 'svg',
  svg: 'svg',
  'image/avif': 'avif',
  avif: 'avif',
  'image/heic': 'heic',
  heic: 'heic',
  'image/heif': 'heif',
  heif: 'heif',
  'image/x-icon': 'ico',
  ico: 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/apng': 'apng',
  apng: 'apng',
  'application/pdf': 'pdf',
  pdf: 'pdf',
  'application/octet-stream': 'bin',
  bin: 'bin',
};

const decodeMaybe = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const ensureExtension = (name: string, extension?: string | null): string => {
  if (!extension) {
    return name;
  }
  const normalized = extension.replace(/^\./, '').trim();
  if (!normalized) {
    return name;
  }
  if (name.toLowerCase().endsWith(`.${normalized.toLowerCase()}`)) {
    return name;
  }
  return `${name}.${normalized}`;
};

const extensionFromMime = (mime?: string | null): string | null => {
  if (!mime) {
    return null;
  }
  const normalized = mime.split(';')[0]?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized in MIME_EXTENSION_MAP) {
    return MIME_EXTENSION_MAP[normalized];
  }
  const [, subtype] = normalized.split('/');
  if (!subtype) {
    return null;
  }
  const cleaned = subtype.split('+')[0];
  return MIME_EXTENSION_MAP[cleaned] ?? cleaned;
};

const extractFilenameFromUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    const queryName =
      parsed.searchParams.get('filename') ??
      parsed.searchParams.get('file') ??
      parsed.searchParams.get('name');
    if (queryName) {
      return decodeMaybe(queryName);
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    if (!segments.length) {
      return null;
    }
    return decodeMaybe(segments[segments.length - 1]);
  } catch {
    return null;
  }
};

const expandCandidateUrls = async (url: string): Promise<string[]> => {
  try {
    const expanded = await ipc.file.expandPreferredUrls(url);
    if (Array.isArray(expanded) && expanded.length) {
      return expanded;
    }
  } catch (error) {
    console.error('Failed to expand dropped URL candidates', error);
  }
  return [url];
};

const getDropCandidates = (dt: DataTransfer | null): ExtractedDropData => {
  if (!dt) {
    return { urls: [], baseUrls: [] };
  }

  const uriList = dt.getData('text/uri-list');
  const text = dt.getData('text/plain');

  const htmlData = dt.getData('text/html');
  let url;
  if (htmlData) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlData;
    const img = tempDiv.querySelector('img');
    if (img?.src) {
      url = img.src;
    }
  }

  if (url) {
    return { urls: [url], baseUrls: [] };
  }

  const rawCandidates = new Set<string>();

  uriList
    .split('\n')
    .map(value => value.trim())
    .filter(Boolean)
    .forEach(value => rawCandidates.add(value));

  if (text) {
    text
      .split('\n')
      .map(value => value.trim())
      .filter(Boolean)
      .forEach(value => rawCandidates.add(value));
  }

  const urls: string[] = [];
  const baseUrls: string[] = [];

  rawCandidates.forEach(value => {
    if (value.startsWith('data:')) {
      baseUrls.push(value);
      return;
    }
    if (value.startsWith('http://') || value.startsWith('https://')) {
      urls.push(value);
    }
  });

  return { urls, baseUrls };
};

/** Convert a File to the serialized payload used for import */
const fileToFileDropPayload = async (file: File): Promise<FileDropFilePayload> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file data'));
      }
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Unknown file read error'));
    };
    reader.readAsDataURL(file);
  });

  const separatorIndex = dataUrl.indexOf(',');
  if (separatorIndex === -1) {
    throw new Error('Invalid data URL');
  }

  const dataBase64 = dataUrl.slice(separatorIndex + 1);

  return {
    name: file.name,
    mimeType: file.type || undefined,
    dataBase64,
  };
};

export const downloadUrlToFilePayload = async (
  url: string,
): Promise<FileDropFilePayload | null> => {
  const candidates = await expandCandidateUrls(url);

  for (const candidate of candidates) {
    try {
      // Use the plugin-http fetch (Fetch-like Response)
      const res = await tauriFetch(candidate, { method: 'GET' });

      // Optional: handle non-2xx statuses explicitly
      if (!res.ok) {
        // Debugging helper: attempt to read text body if available
        try {
          const errText = await res.text();
          console.error('HTTP failed:', res.status, errText);
        } catch {
          console.error('HTTP failed:', res.status);
        }
        return null;
      }

      // Headers is a standard Web Headers object in v2
      const mimeType = res.headers.get('content-type') ?? 'application/octet-stream';

      // Read binary as ArrayBuffer
      const arrBuf = await res.arrayBuffer();

      const buffer = new Uint8Array(arrBuf);

      const extension = extensionFromMime(mimeType);
      const fileName = ensureExtension(
        extractFilenameFromUrl(url) ?? `download-${String(Date.now())}`,
        extension,
      );

      // Blob → File
      const blob = new Blob([buffer], { type: mimeType });
      const file = new File([blob], fileName, {
        type: mimeType,
        lastModified: Date.now(),
      });

      return await fileToFileDropPayload(file);
    } catch (err) {
      console.error('plugin-http fetch failed:', err);
      return null;
    }
  }
  return null;
};

export const useFileDrop = ({
  dropEnabled,
  rootNodeId,
  moaId,
  refreshPanelData,
}: UseFileDropParams) => {
  const [isDropActive, setIsDropActive] = useState(false);

  const shouldHandleDrag = useCallback(
    (dt: DataTransfer | null) => {
      if (!dropEnabled || !dt) return false;
      const types = Array.from(dt.types);
      return (
        types.includes('Files') ||
        types.includes('text/uri-list') ||
        types.includes('text/plain') ||
        types.includes('text/html')
      );
    },
    [dropEnabled],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      if (!dropEnabled) return;
      event.preventDefault();
      event.stopPropagation();
      setIsDropActive(false);

      const files = Array.from(event.dataTransfer.files);
      let filePayloads: FileDropFilePayload[] = [];

      if (files.length) {
        try {
          filePayloads = await Promise.all(files.map(fileToFileDropPayload));
        } catch (error) {
          console.error('Failed to read dropped files', error);
          return;
        }
      }

      const { urls, baseUrls } = getDropCandidates(event.dataTransfer);
      if (!rootNodeId || !moaId) {
        return;
      }

      const remotePayloads: FileDropFilePayload[] = [];
      const remainingUrls: string[] = [];

      for (const url of urls) {
        const payload = await downloadUrlToFilePayload(url);
        if (payload) {
          remotePayloads.push(payload);
        } else {
          remainingUrls.push(url);
        }
      }

      const combinedFilePayloads = [...filePayloads, ...remotePayloads];

      if (!combinedFilePayloads.length && !baseUrls.length && !remainingUrls.length) {
        return;
      }

      try {
        await ipc.file.importPanelDrop({
          moaId,
          virtualNodeId: rootNodeId,
          urls: remainingUrls.length ? remainingUrls : undefined,
          baseUrls: baseUrls.length ? baseUrls : undefined,
          files: combinedFilePayloads.length ? combinedFilePayloads : undefined,
        });
        await refreshPanelData();
      } catch (error) {
        console.error('Failed to import dropped content', error);
      }
    },
    [dropEnabled, moaId, refreshPanelData, rootNodeId],
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!shouldHandleDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      setIsDropActive(true);
    },
    [shouldHandleDrag],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!shouldHandleDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      setIsDropActive(true);
    },
    [shouldHandleDrag],
  );

  const handleDragLeave = useCallback(() => {
    setIsDropActive(false);
  }, []);

  return {
    isDropActive,
    handleDrop,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
  };
};

export type UseFileDropReturn = ReturnType<typeof useFileDrop>;

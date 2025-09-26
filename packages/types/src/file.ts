export enum FileType {
  Image = 'image',
  Video = 'video',
  Document = 'document',
  GraphicTool = 'graphictool',
  Audio = 'audio',
  Archive = 'archive',
  Unknown = 'unknown',
}

export type ThumbJobStatus = 'ready' | 'pending' | 'error';

export type ThumbEntry = {
  status: ThumbJobStatus;
  url?: string;
  placeholder?: string;
  error?: string;
  updatedAt: number;
};

/** Resize behavior for thumbnails. */
export enum ResizeMode {
  Upscale = 'upscale',
  Original = 'original',
}

/** Output format for thumbnails. */
export enum ImageFmt {
  Webp = 'webp',
  Jpeg = 'jpeg',
}

/** Server thumbnail generation status. */
export enum ThumbStatus {
  Hit = 'hit',
  Miss = 'miss',
  Error = 'error',
}

// ---------- Thumbnail request/response ----------

export interface ThumbSpec {
  width: number;
  height: number;
  dpr?: 1 | 2 | 3;
  fmt?: ImageFmt; // default webp
  mode?: ResizeMode; // default Original
  key: string; // client-defined identifier to correlate
}

export interface ThumbReqInfo {
  xxhs: string; // hex lowercase preferred
  specs: ThumbSpec[];
}

export interface ThumbRequest {
  items: ThumbReqInfo[];
}

export interface ThumbResSpec {
  status: ThumbStatus;
  url?: string;
  thumbKey: string;
  enqueued: boolean;
  errorMsg?: string;
}

export interface ThumbResInfo {
  xxhs: string;
  specs: ThumbResSpec[];
}

export interface ThumbResponse {
  items: ThumbResInfo[];
}

export interface ThumbnailUsage {
  baseBytes: number;
  derivedBytes: number;
  totalBytes: number;
  baseFiles: number;
  derivedFiles: number;
  totalFiles: number;
}

export interface FolderPreviewFileStat {
  fileType: FileType;
  count: number;
  bytes: number;
}

export interface FolderPreviewNode {
  name: string;
  path: string;
  relativePath: string;
  totalFiles: number;
  totalBytes: number;
  fileStats: FolderPreviewFileStat[];
  children: FolderPreviewNode[];
}

export interface FolderPreviewSummary {
  totalFolders: number;
  totalFiles: number;
  totalBytes: number;
  fileTypeTotals: FolderPreviewFileStat[];
}

export interface FolderPreview {
  root: FolderPreviewNode;
  summary: FolderPreviewSummary;
}

export interface FolderSelectionEntry {
  relativePath: string;
  include: boolean;
  fileTypes?: FileType[];
}

export interface FolderSelection {
  entries: FolderSelectionEntry[];
}

export interface CreateFolderPayload {
  name: string;
  path: string;
  parent_id: string;
  selection?: FolderSelection;
  expectedBytes?: number;
  expectedFiles?: number;
}

export type IntegrityCheckResult = 'success' | 'notfound' | 'mismatch';

export type FolderHealthState = 'normal' | 'warning' | 'error';

export interface FolderMountState {
  mountId: string;
  realFolderId: string;
  recursive: boolean;
  syncEnabled: boolean;
  suppressWarnings: boolean;
  realPath?: string | null;
  errorFlag: IntegrityCheckResult;
  errorMsg?: string | null;
  lastSeenScanId?: string | null;
  lastSeenAt?: string | null;
  includeExtensions: string[];
  excludeExtensions: string[];
}

export interface FolderOptionUpdatePayload {
  path?: string;
  recursive: boolean;
  syncEnabled: boolean;
  suppressWarnings: boolean;
  includeExtensions?: string[];
  excludeExtensions?: string[];
}

export type FilePathStatus = 'ok' | 'warning' | 'error';

export interface FilePathInfo {
  id: string;
  path?: string | null;
  exists: boolean;
  storedMtime?: number | null;
  currentMtime?: number | null;
  hashMatches?: boolean | null;
  status: FilePathStatus;
  warning?: string | null;
  error?: string | null;
}

export interface FileFolderInfo {
  nodeId: string;
  name: string;
}

export interface FileSummary {
  fileId: string;
  nodeId: string;
  fileName: string;
  mime: string;
  size: number;
  hash: string;
  kind: FileType;
  width?: number | null;
  height?: number | null;
}

export interface FileDetail {
  file: FileSummary;
  folders: FileFolderInfo[];
  paths: FilePathInfo[];
}

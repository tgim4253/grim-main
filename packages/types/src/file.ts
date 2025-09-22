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

export interface FileSettings {
  precacheBaseThumbnails: boolean;
}

export interface UpdateFileSettingsPayload {
  precacheBaseThumbnails?: boolean;
}

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
  ensureBase?: boolean;
}

export interface ThumbRequest {
  items: ThumbReqInfo[];
  ensureBase?: boolean;
}

export interface ThumbResSpec {
  status: ThumbStatus;
  url?: string;
  thumb_key: string;
  enqueued: boolean;
  error_msg?: string;
}

export interface ThumbResInfo {
  xxhs: string;
  specs: ThumbResSpec[];
}

export interface ThumbResponse {
  items: ThumbResInfo[];
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

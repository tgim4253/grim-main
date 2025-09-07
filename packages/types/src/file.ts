export type ThumbJobStatus = 'ready' | 'pending' | 'error';

export type ThumbEntry = {
  status: ThumbJobStatus;
  url?: string;
  placeholder?: string;
  error?: string;
  updatedAt: number;
  v: number; // transform schema version
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
  v?: number; // schema version
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
  url?: string | null;
  thumb_key: string;
  enqueued: boolean;
  error_msg?: string | null;
}

export interface ThumbResInfo {
  xxhs: string;
  specs: ThumbResSpec[];
}

export interface ThumbResponse {
  items: ThumbResInfo[];
}

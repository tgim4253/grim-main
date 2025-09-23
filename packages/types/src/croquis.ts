export interface CroquisWindowOption {
  width?: string | null;
  height?: string | null;
}

export interface CroquisAutoOption {
  isSkip: boolean;
}

export interface CroquisTimerOption {
  maxTime: number;
}

export interface CroquisOption {
  window: CroquisWindowOption;
  auto: CroquisAutoOption;
  timer: CroquisTimerOption;
  isCapture: boolean;
  savePath: string;
  isGray: boolean;
  isShuffle: boolean;
}

export interface CroquisStartPayload {
  moaId: string;
  option: CroquisOption;
  imageHashes: string[];
  saveOption?: boolean;
}

export interface CroquisSessionImage {
  hash: string;
  basePath: string;
  baseWidth: number;
  baseHeight: number;
  sourcePath: string;
}

export interface CroquisSession {
  sessionId: string;
  moaId: string;
  option: CroquisOption;
  images: CroquisSessionImage[];
  createdAt: string;
}

export interface CroquisStartResponse {
  sessionId: string;
  windowLabel: string;
}

export interface CroquisCaptureStartPayload {
  sessionId: string;
  imageHash: string;
}

export interface CroquisCaptureStartResponse {
  captureId: string;
}

export interface CroquisCaptureContext {
  captureId: string;
  sessionId: string;
  imageHash: string;
  moaId: string;
  savePath: string;
}

export interface CroquisCaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CroquisCaptureMonitor {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export interface CroquisCapturePreviewPayload {
  captureId: string;
  rect: CroquisCaptureRect;
  monitor: CroquisCaptureMonitor;
}

export interface CroquisCapturePreview {
  previewPath: string;
  rect: CroquisCaptureRect;
}

export interface CroquisCaptureConfirmResponse {
  filePath: string;
  fileName: string;
}

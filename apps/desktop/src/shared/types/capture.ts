export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Bounds are expressed in logical screen points, matching browser event coordinates.
export interface CaptureMonitor {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export interface CapturePreviewPayload {
  rect: CaptureRect;
  monitor: CaptureMonitor;
}

export interface CapturePreview {
  baseUrl: string;
}

export interface CaptureContext {
  sessionId?: string | null;
  recordId?: string | null;
  assetId?: string | null;
  targetSeconds?: number | null;
  actualSeconds?: number | null;
  resultSavePath?: string | null;
}

export type CaptureOverlayPayload = CaptureContext;

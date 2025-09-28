export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  moaId: string;
  sourceHash?: string | null;
  sourceNodeId?: string | null;
  savePath: string;
  sessionId?: string | null;
  linkTypeForward?: string | null;
  linkTypeReverse?: string | null;
}

export interface CaptureOverlayPayload extends CaptureContext {}

import type {
  CaptureContext,
  CaptureOverlayPayload,
  CapturePreview,
  CapturePreviewPayload,
} from '../../types';
import { invokeCamel, invokeRaw } from './core';

export const captureIpc = {
  openOverlay: (payload: CaptureOverlayPayload) => invokeRaw('open_capture_overlay', { payload }),
  renderPreview: (payload: CapturePreviewPayload) =>
    invokeCamel<CapturePreview>(
      'render_capture_preview',
      payload as unknown as Record<string, unknown>,
    ),
  confirm: (payload: { baseUrl: string; context: CaptureContext }) =>
    invokeRaw('confirm_capture', payload),
};

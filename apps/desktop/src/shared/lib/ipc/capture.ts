import type {
  CaptureContext,
  CaptureOverlayPayload,
  CapturePreview,
  CapturePreviewPayload,
} from '../../types';
import { invokeCamel, invokeRaw } from './core';

export const captureIpc = {
  openOverlay: (payload: CaptureOverlayPayload) => invokeRaw('open_capture_overlay', { payload }),
  renderPreview: (payload: CapturePreviewPayload): Promise<CapturePreview> =>
    invokeCamel('render_capture_preview', payload),
  confirm: (payload: { baseUrl: string; context: CaptureContext }) =>
    invokeRaw('confirm_capture', payload),
};

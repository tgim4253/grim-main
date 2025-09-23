import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Button } from '@tgim/ui';
import {
  CroquisCaptureContext,
  CroquisCaptureMonitor,
  CroquisCapturePreview,
  CroquisCaptureRect,
} from '@tgim/types/croquis';
import { ipc } from '../../lib/ipc';
import { toast } from 'react-toastify';

const MIN_SELECTION_SIZE = 12;

type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PointerPoint = {
  x: number;
  y: number;
};

type Phase = 'loading' | 'selecting' | 'preview';

type CaptureMode = 'freeform' | 'square';

const normaliseRect = (
  rect: CroquisCaptureRect,
  monitor: CroquisCaptureMonitor,
): CroquisCaptureRect => {
  const maxWidth = monitor.width;
  const maxHeight = monitor.height;

  const x = Math.max(0, Math.min(rect.x, maxWidth));
  const y = Math.max(0, Math.min(rect.y, maxHeight));
  const width = Math.max(1, Math.min(rect.width, maxWidth - x));
  const height = Math.max(1, Math.min(rect.height, maxHeight - y));

  return { x, y, width, height };
};

const CroquisCaptureOverlay: React.FC = () => {
  const [params] = useSearchParams();
  const captureId = params.get('capture_id');

  const [context, setContext] = useState<CroquisCaptureContext | null>(null);
  const [monitorInfo, setMonitorInfo] = useState<CroquisCaptureMonitor | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [mode, setMode] = useState<CaptureMode>('freeform');
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [preview, setPreview] = useState<CroquisCapturePreview | null>(null);
  const [busy, setBusy] = useState(false);

  const startRef = useRef<PointerPoint | null>(null);
  const isPointerDownRef = useRef(false);
  const confirmedRef = useRef(false);

  const windowRef = useRef(getCurrentWindow());

  useEffect(() => {
    const body = document.body;
    const previousBg = body.style.backgroundColor;
    const previousSelect = body.style.userSelect;
    body.style.backgroundColor = 'rgba(0, 0, 0, 0.45)';
    body.style.userSelect = 'none';
    return () => {
      body.style.backgroundColor = previousBg;
      body.style.userSelect = previousSelect;
    };
  }, []);

  useEffect(() => {
    if (!captureId) {
      toast.error('Capture session was not found.');
      void (async () => {
        await windowRef.current.close();
      })();
    }
  }, [captureId]);

  useEffect(() => {
    let cancelled = false;
    if (!captureId) return;

    setPhase('loading');
    setContext(null);

    void (async () => {
      try {
        const ctx = await ipc.croquis.loadCaptureContext(captureId);
        if (cancelled) return;
        if (!ctx) {
          toast.error('Capture session expired.');
          await windowRef.current.close();
          return;
        }
        setContext(ctx);
      } catch (error) {
        console.error('[Croquis] Failed to load capture context', error);
        toast.error('Failed to load capture session.');
        await windowRef.current.close();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [captureId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const win = windowRef.current;
        const monitor = await win.currentMonitor();
        if (cancelled) return;
        if (monitor) {
          setMonitorInfo({
            x: monitor.position.x,
            y: monitor.position.y,
            width: monitor.size.width,
            height: monitor.size.height,
            scaleFactor: monitor.scaleFactor ?? window.devicePixelRatio ?? 1,
          });
        } else {
          const scale = window.devicePixelRatio ?? 1;
          setMonitorInfo({
            x: 0,
            y: 0,
            width: Math.round(window.innerWidth * scale),
            height: Math.round(window.innerHeight * scale),
            scaleFactor: scale,
          });
        }
      } catch (error) {
        console.error('[Croquis] Failed to resolve monitor info', error);
        const scale = window.devicePixelRatio ?? 1;
        setMonitorInfo({
          x: 0,
          y: 0,
          width: Math.round(window.innerWidth * scale),
          height: Math.round(window.innerHeight * scale),
          scaleFactor: scale,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (context && monitorInfo) {
      setPhase('selecting');
    }
  }, [context, monitorInfo]);

  useEffect(() => {
    const body = document.body;
    if (phase === 'selecting') {
      body.style.cursor = 'crosshair';
    } else {
      body.style.cursor = 'default';
    }
    return () => {
      body.style.cursor = 'default';
    };
  }, [phase]);

  useEffect(() => {
    return () => {
      if (!captureId || confirmedRef.current) return;
      void ipc.croquis.cancelCapture(captureId);
    };
  }, [captureId]);

  const createSquareRect = useCallback(
    (start: PointerPoint, current: PointerPoint): SelectionRect => {
      const deltaX = current.x - start.x;
      const deltaY = current.y - start.y;
      const size = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      const dirX = deltaX < 0 ? -1 : 1;
      const dirY = deltaY < 0 ? -1 : 1;
      const endX = start.x + size * dirX;
      const endY = start.y + size * dirY;
      const x = Math.min(start.x, endX);
      const y = Math.min(start.y, endY);
      return {
        x,
        y,
        width: Math.abs(endX - start.x),
        height: Math.abs(endY - start.y),
      };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (phase !== 'selecting' || busy) return;
      event.preventDefault();
      const point = { x: event.clientX, y: event.clientY };
      startRef.current = point;
      isPointerDownRef.current = true;
      setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
    },
    [busy, phase],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isPointerDownRef.current || !startRef.current || phase !== 'selecting') return;
      event.preventDefault();
      const current = { x: event.clientX, y: event.clientY };
      let rect: SelectionRect;
      if (mode === 'square') {
        rect = createSquareRect(startRef.current, current);
      } else {
        rect = {
          x: Math.min(startRef.current.x, current.x),
          y: Math.min(startRef.current.y, current.y),
          width: Math.abs(current.x - startRef.current.x),
          height: Math.abs(current.y - startRef.current.y),
        };
      }
      setSelection(rect);
    },
    [createSquareRect, mode, phase],
  );

  const handlePointerUp = useCallback(
    async (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isPointerDownRef.current || phase !== 'selecting') return;
      event.preventDefault();
      isPointerDownRef.current = false;
      if (!selection || !monitorInfo || !captureId) {
        setSelection(null);
        return;
      }
      if (selection.width < MIN_SELECTION_SIZE || selection.height < MIN_SELECTION_SIZE) {
        setSelection(null);
        return;
      }
      await (async () => {
        setBusy(true);
        setPhase('loading');
        try {
          const scale = monitorInfo.scaleFactor || window.devicePixelRatio || 1;
          const scaled: CroquisCaptureRect = {
            x: Math.round(selection.x * scale),
            y: Math.round(selection.y * scale),
            width: Math.round(selection.width * scale),
            height: Math.round(selection.height * scale),
          };
          const normalized = normaliseRect(scaled, monitorInfo);
          const response = await ipc.croquis.renderCapturePreview({
            captureId,
            rect: normalized,
            monitor: monitorInfo,
          });
          setPreview(response);
          setSelection(null);
          setPhase('preview');
        } catch (error) {
          console.error('[Croquis] Failed to render capture preview', error);
          toast.error('Failed to capture selection. Please try again.');
          setSelection(null);
          setPhase('selecting');
        } finally {
          setBusy(false);
        }
      })();
    },
    [captureId, monitorInfo, phase, selection],
  );

  const handleFullScreenCapture = useCallback(() => {
    if (!monitorInfo || !captureId || phase === 'loading') return;
    const scale = monitorInfo.scaleFactor || window.devicePixelRatio || 1;
    const rect: CroquisCaptureRect = {
      x: 0,
      y: 0,
      width: Math.round(monitorInfo.width),
      height: Math.round(monitorInfo.height),
    };
    const viewRect: SelectionRect = {
      x: 0,
      y: 0,
      width: monitorInfo.width / scale,
      height: monitorInfo.height / scale,
    };

    setSelection(viewRect);
    void (async () => {
      setBusy(true);
      setPhase('loading');
      try {
        const response = await ipc.croquis.renderCapturePreview({
          captureId,
          rect: normaliseRect(rect, monitorInfo),
          monitor: monitorInfo,
        });
        setPreview(response);
        setSelection(null);
        setPhase('preview');
      } catch (error) {
        console.error('[Croquis] Failed to capture full screen', error);
        toast.error('Failed to capture full screen.');
        setSelection(null);
        setPhase('selecting');
      } finally {
        setBusy(false);
      }
    })();
  }, [captureId, monitorInfo, phase]);

  const handleRetake = useCallback(() => {
    setPreview(null);
    setSelection(null);
    setPhase('selecting');
  }, []);

  const handleCancel = useCallback(async () => {
    if (!captureId) {
      await windowRef.current.close();
      return;
    }
    try {
      await ipc.croquis.cancelCapture(captureId);
    } catch (error) {
      console.error('[Croquis] Failed to cancel capture', error);
    } finally {
      confirmedRef.current = true;
      await windowRef.current.close();
    }
  }, [captureId]);

  const handleConfirm = useCallback(async () => {
    if (!captureId) return;
    setBusy(true);
    try {
      const result = await ipc.croquis.confirmCapture(captureId);
      toast.success(`Capture saved as ${result.fileName}`);
      confirmedRef.current = true;
      await windowRef.current.close();
    } catch (error) {
      console.error('[Croquis] Failed to confirm capture', error);
      toast.error('Failed to save capture. Please try again.');
      setBusy(false);
      setPhase('selecting');
    }
  }, [captureId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void handleCancel();
      }
      if (event.key === 'Enter' && phase === 'preview') {
        event.preventDefault();
        void handleConfirm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [handleCancel, handleConfirm, phase]);

  const previewSrc = useMemo(() => {
    if (!preview) return null;
    return convertFileSrc(preview.previewPath);
  }, [preview]);

  const renderSelectionOverlay = () => {
    if (!selection || phase !== 'selecting') return null;
    return (
      <div
        className="absolute border-2 border-accent bg-accent/10"
        style={{
          left: `${selection.x}px`,
          top: `${selection.y}px`,
          width: `${selection.width}px`,
          height: `${selection.height}px`,
        }}
      >
        <div className="absolute right-2 top-2 rounded bg-accent px-2 py-1 text-xs text-black">
          {Math.round(selection.width)} × {Math.round(selection.height)}
        </div>
      </div>
    );
  };

  const renderPreview = () => {
    if (phase !== 'preview') return null;
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-12">
        <div className="pointer-events-auto max-h-full max-w-4xl rounded-lg bg-surface p-4 shadow-xl">
          {previewSrc ? (
            <img
              src={previewSrc}
              alt="Croquis capture preview"
              className="max-h-[70vh] max-w-full rounded"
            />
          ) : (
            <div className="p-6 text-center text-sm text-text-soft">Preparing preview…</div>
          )}
        </div>
      </div>
    );
  };

  const renderBottomControls = () => {
    const disabled = busy || phase === 'loading';
    if (phase === 'preview') {
      return (
        <div className="pointer-events-auto flex items-center gap-3">
          <Button variant="secondary" onClick={handleRetake} disabled={busy}>
            Retake
          </Button>
          <Button variant="secondary" onClick={handleCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleConfirm} disabled={busy}>
            Confirm
          </Button>
        </div>
      );
    }

    return (
      <div className="pointer-events-auto flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => setMode('freeform')}
          active={mode === 'freeform'}
          disabled={disabled}
        >
          Freeform
        </Button>
        <Button
          variant="secondary"
          onClick={() => setMode('square')}
          active={mode === 'square'}
          disabled={disabled}
        >
          Square
        </Button>
        <Button variant="secondary" onClick={handleFullScreenCapture} disabled={disabled}>
          Full screen
        </Button>
        <Button variant="secondary" onClick={handleCancel} disabled={disabled}>
          Cancel
        </Button>
      </div>
    );
  };

  return (
    <div
      className="relative flex h-screen w-screen select-none flex-col text-white"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="absolute inset-0" />
      {phase === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/80">
          {busy ? 'Processing capture…' : 'Preparing capture window…'}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-12 flex justify-center text-center text-sm text-white">
        {phase === 'selecting'
          ? 'Drag to select the area to capture or choose an option below.'
          : phase === 'preview'
            ? 'Review the capture and confirm or retake.'
            : 'Preparing capture window…'}
      </div>

      {renderSelectionOverlay()}
      {renderPreview()}

      <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center">
        {renderBottomControls()}
      </div>
    </div>
  );
};

export default CroquisCaptureOverlay;

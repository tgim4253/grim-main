import { CaptureContext, CaptureMonitor, CaptureRect } from '@tgim/types/capture';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ipc } from '../../lib/ipc';
import Button from '@tgim/ui/Button';
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

const IDLE_OVERLAY_COLOR = 'rgba(0, 0, 0, 0.35)';
const ACTIVE_OVERLAY_COLOR = 'rgba(0, 0, 0, 0)';
const DEFAULT_LINK_TYPE = 'relativeimage';

const normaliseRect = (rect: CaptureRect, monitor: CaptureMonitor): CaptureRect => {
  const maxWidth = monitor.width;
  const maxHeight = monitor.height;

  const x = Math.max(0, Math.min(rect.x, maxWidth));
  const y = Math.max(0, Math.min(rect.y, maxHeight));
  // assume left to right
  const width = Math.max(1, Math.min(rect.width, maxWidth - x));
  // assume top to bottom
  const height = Math.max(1, Math.min(rect.height, maxHeight - y));

  return { x, y, width, height };
};

const CaptureOverlay: React.FC = () => {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const savePath = params.get('save_path') ?? '';
  const moaId = params.get('moa_id');
  const sourceHash = params.get('source_hash') ?? params.get('image_hash');
  const sourceNodeId = params.get('source_node_id');
  const linkTypeForward = params.get('link_type_forward') ?? DEFAULT_LINK_TYPE;
  const linkTypeReverse = params.get('link_type_reverse') ?? DEFAULT_LINK_TYPE;

  const [context, setContext] = useState<CaptureContext | null>(null);
  const [monitorInfo, setMonitorInfo] = useState<CaptureMonitor | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [mode, setMode] = useState<CaptureMode>('freeform');
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [windowOffset, setWindowOffset] = useState<PointerPoint>({ x: 0, y: 0 });

  const startRef = useRef<PointerPoint | null>(null);
  const isPointerDownRef = useRef(false);
  const confirmedRef = useRef(false);

  const windowRef = useRef(getCurrentWindow());

  useEffect(() => {
    const body = document.body;
    const prevColor = body.style.backgroundColor;
    const prevSelect = body.style.userSelect;
    body.style.backgroundColor = IDLE_OVERLAY_COLOR;
    body.style.userSelect = 'none';

    return () => {
      body.style.backgroundColor = prevColor;
      body.style.userSelect = prevSelect;
    };
  }, []);

  useEffect(() => {
    setPhase('loading');

    if (!moaId) return;
    if (!sourceHash && !sourceNodeId) return;
    setContext({
      moaId,
      sourceHash: sourceHash ?? null,
      sourceNodeId: sourceNodeId ?? null,
      savePath,
      sessionId: sessionId ?? null,
      linkTypeForward,
      linkTypeReverse,
    });
  }, [
    moaId,
    sourceHash,
    sourceNodeId,
    savePath,
    sessionId,
    linkTypeForward,
    linkTypeReverse,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const monitor = await currentMonitor();
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
        console.error('[Capture] Failed to resolve monitor info', error);
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
    if (!monitorInfo) return;
    let cancelled = false;

    const resolveWindowOffset = async () => {
      try {
        const windowPosition = await windowRef.current.innerPosition();
        if (cancelled) return;
        setWindowOffset({
          x: windowPosition.x - monitorInfo.x,
          y: windowPosition.y - monitorInfo.y,
        });
      } catch (error) {
        console.error('[Capture] Failed to resolve window offset', error);
        if (!cancelled) {
          setWindowOffset({ x: 0, y: 0 });
        }
      }
    };

    void resolveWindowOffset();

    return () => {
      cancelled = true;
    };
  }, [monitorInfo]);

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
      document.body.style.backgroundColor = ACTIVE_OVERLAY_COLOR;
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
      document.body.style.backgroundColor = IDLE_OVERLAY_COLOR;

      isPointerDownRef.current = false;
      if (!selection || !monitorInfo) {
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
        const body = document.body;
        const previousOpacity = body.style.opacity;
        try {
          body.style.opacity = '0';
          let offsetX = windowOffset.x;
          let offsetY = windowOffset.y;
          try {
            const windowPosition = await windowRef.current.innerPosition();
            offsetX = windowPosition.x - monitorInfo.x;
            offsetY = windowPosition.y - monitorInfo.y;
            setWindowOffset({ x: offsetX, y: offsetY });
          } catch (error) {
            console.error('[Capture] Failed to refresh window offset', error);
          }

          const fallbackScale = window.devicePixelRatio ?? 1;
          const scale = monitorInfo.scaleFactor > 0 ? monitorInfo.scaleFactor : fallbackScale;
          const offsetLogicalX = offsetX / scale;
          const offsetLogicalY = offsetY / scale;
          const logical: CaptureRect = {
            x: Math.round(selection.x + offsetLogicalX),
            y: Math.round(selection.y + offsetLogicalY),
            width: Math.round(selection.width),
            height: Math.round(selection.height),
          };
          const normalized = normaliseRect(logical, monitorInfo);
          const response = await ipc.capture.renderPreview({
            rect: normalized,
            monitor: monitorInfo,
          });
          setBaseUrl(response.baseUrl);
          setSelection(null);
          setPhase('preview');
        } catch (error) {
          console.error('[Capture] Failed to render capture preview', error);
          toast.error('Failed to capture selection. Please try again.');
          setSelection(null);
          setPhase('selecting');
        } finally {
          body.style.opacity = previousOpacity;
          setBusy(false);
        }
      })();
    },
    [monitorInfo, phase, selection, windowOffset],
  );

  const handleRetake = useCallback(() => {
    setSelection(null);
    setBaseUrl(null);
    setPhase('selecting');
    document.body.style.backgroundColor = IDLE_OVERLAY_COLOR;
  }, []);

  const handlePointerCancel = useCallback(() => {
    if (!isPointerDownRef.current) return;
    isPointerDownRef.current = false;
    setSelection(null);
    document.body.style.backgroundColor = IDLE_OVERLAY_COLOR;
  }, []);

  const handleCancel = useCallback(async () => {
    confirmedRef.current = true;
    await windowRef.current.close();
  }, []);

  const handleConfirm = useCallback(async () => {
    setBusy(true);
    try {
      if (!context || !baseUrl) return;
      await ipc.capture.confirm({ baseUrl, context });
      toast.success('Capture saved');
      confirmedRef.current = true;
      await windowRef.current.close();
    } catch (error) {
      console.error('[Capture] Failed to confirm capture', error);
      toast.error('Failed to save capture. Please try again.');
      setBusy(false);
      setPhase('selecting');
    }
  }, [baseUrl, context]);

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
        <div className="pointer-events-auto max-h-full max-w-4xl rounded-lg bg-surface p-4 justify-center shadow-xl">
          <div className="w-full flex justify-center">
            {baseUrl ? (
              <img
                src={baseUrl}
                alt="Capture preview"
                className="max-h-[70vh] max-w-full rounded border-2 border-border"
              />
            ) : (
              <div className="p-6 text-center text-sm text-text-soft">Preparing preview…</div>
            )}
          </div>

          <div className="w-full flex justify-center mt-2">
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
          </div>
        </div>
      </div>
    );
  };

  const renderBottomControls = () => {
    const disabled = busy || phase === 'loading';

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
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
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

export default CaptureOverlay;

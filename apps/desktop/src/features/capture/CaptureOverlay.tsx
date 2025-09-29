import { CaptureContext, CaptureMonitor, CaptureRect } from '@tgim/types/capture';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ipc } from '../../lib/ipc';
import Button from '@tgim/ui/Button';
import { toast } from 'react-toastify';
import { usePointerSelection, type PointerSelectionRect } from '@tgim/hooks';

const MIN_SELECTION_SIZE = 12;

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
  const [busy, setBusy] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [windowOffset, setWindowOffset] = useState<PointerPoint>({ x: 0, y: 0 });

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
  }, [moaId, sourceHash, sourceNodeId, savePath, sessionId, linkTypeForward, linkTypeReverse]);

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

  const {
    selection,
    completedSelection,
    resetSelection,
    clearCompletedSelection,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = usePointerSelection<HTMLDivElement>({
    mode,
    minSize: MIN_SELECTION_SIZE,
    disabled: phase !== 'selecting' || busy,
    onSelectionStart: () => {
      document.body.style.backgroundColor = ACTIVE_OVERLAY_COLOR;
    },
    onSelectionCancel: () => {
      document.body.style.backgroundColor = IDLE_OVERLAY_COLOR;
    },
    onSelectionInvalid: () => {
      document.body.style.backgroundColor = IDLE_OVERLAY_COLOR;
    },
  });

  useEffect(() => {
    if (!completedSelection || phase !== 'selecting') return;

    const rect: PointerSelectionRect = completedSelection;

    const run = async () => {
      if (!monitorInfo) {
        clearCompletedSelection();
        resetSelection();
        return;
      }

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
          x: Math.round(rect.x + offsetLogicalX),
          y: Math.round(rect.y + offsetLogicalY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
        const normalized = normaliseRect(logical, monitorInfo);
        const response = await ipc.capture.renderPreview({
          rect: normalized,
          monitor: monitorInfo,
        });
        setBaseUrl(response.baseUrl);
        resetSelection();
        setPhase('preview');
      } catch (error) {
        console.error('[Capture] Failed to render capture preview', error);
        toast.error('Failed to capture selection. Please try again.');
        resetSelection();
        setPhase('selecting');
      } finally {
        body.style.opacity = previousOpacity;
        setBusy(false);
        clearCompletedSelection();
      }
    };

    void run();
  }, [clearCompletedSelection, completedSelection, monitorInfo, phase, resetSelection, windowOffset]);

  const handleRetake = useCallback(() => {
    resetSelection();
    setBaseUrl(null);
    setPhase('selecting');
    document.body.style.backgroundColor = IDLE_OVERLAY_COLOR;
  }, [resetSelection]);

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

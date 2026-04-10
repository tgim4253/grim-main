import { useEffect, useMemo, useRef, useState } from 'react';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../../shared/ui';
import { usePointerSelection, type PointerSelectionRect } from '../../../shared/hooks';
import type { CaptureContext, CaptureMonitor, CaptureRect } from '../../../shared/types';
import { ipc } from '../../../shared/lib/ipc';
import './capture.css';

type OverlayPhase = 'loading' | 'selecting' | 'preview';

const MIN_SELECTION_SIZE = 12;

const normaliseRect = (
  rect: PointerSelectionRect,
  offsetX: number,
  offsetY: number,
): CaptureRect => ({
  x: Math.max(0, Math.round(rect.x + offsetX)),
  y: Math.max(0, Math.round(rect.y + offsetY)),
  width: Math.max(1, Math.round(rect.width)),
  height: Math.max(1, Math.round(rect.height)),
});

export function CaptureOverlay() {
  const [params] = useSearchParams();
  const [monitor, setMonitor] = useState<CaptureMonitor | null>(null);
  const [phase, setPhase] = useState<OverlayPhase>('loading');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const windowRef = useRef(getCurrentWindow());

  const context = useMemo<CaptureContext>(
    () => ({
      sessionId: params.get('session_id'),
      recordId: params.get('record_id'),
      assetId: params.get('asset_id'),
      targetSeconds: params.get('target_seconds') ? Number(params.get('target_seconds')) : null,
      actualSeconds: params.get('actual_seconds') ? Number(params.get('actual_seconds')) : null,
    }),
    [params],
  );

  useEffect(() => {
    document.body.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
    document.body.style.cursor = phase === 'selecting' ? 'crosshair' : 'default';
    return () => {
      document.body.style.backgroundColor = '';
      document.body.style.cursor = '';
    };
  }, [phase]);

  useEffect(() => {
    let cancelled = false;

    const resolveMonitor = async () => {
      try {
        const current = await currentMonitor();
        if (cancelled) {
          return;
        }

        if (current) {
          setMonitor({
            x: current.position.x,
            y: current.position.y,
            width: current.size.width,
            height: current.size.height,
            scaleFactor: current.scaleFactor,
          });
        } else {
          setMonitor({
            x: 0,
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight,
            scaleFactor: window.devicePixelRatio || 1,
          });
        }
        setPhase('selecting');
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to resolve monitor');
        }
      }
    };

    void resolveMonitor();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    selection,
    completedSelection,
    clearCompletedSelection,
    resetSelection,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = usePointerSelection<HTMLDivElement>({
    mode: 'freeform',
    minSize: MIN_SELECTION_SIZE,
    disabled: phase !== 'selecting' || busy,
  });

  useEffect(() => {
    if (!completedSelection || !monitor) {
      return;
    }

    let cancelled = false;
    const renderPreview = async () => {
      setBusy(true);
      setError(null);
      setPhase('loading');
      try {
        const position = await windowRef.current.innerPosition();
        const scale = monitor.scaleFactor > 0 ? monitor.scaleFactor : window.devicePixelRatio || 1;
        const offsetX = (position.x - monitor.x) / scale;
        const offsetY = (position.y - monitor.y) / scale;
        const rect = normaliseRect(completedSelection, offsetX, offsetY);
        const preview = await ipc.capture.renderPreview({ rect, monitor });
        if (cancelled) {
          return;
        }

        setPreviewUrl(preview.baseUrl);
        setPhase('preview');
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to render preview');
          setPhase('selecting');
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
          clearCompletedSelection();
          resetSelection();
        }
      }
    };

    void renderPreview();
    return () => {
      cancelled = true;
    };
  }, [clearCompletedSelection, completedSelection, monitor, resetSelection]);

  const handleConfirmCapture = () => {
    if (previewUrl === null) {
      return;
    }

    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await ipc.capture.confirm({ baseUrl: previewUrl, context });
        await windowRef.current.close();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to confirm capture');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div
      className="capture-overlay"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {phase === 'selecting' ? (
        <div className="capture-overlay__selection-stage">
          {selection ? (
            <div
              className="capture-overlay__selection-box"
              style={{
                left: selection.x,
                top: selection.y,
                width: selection.width,
                height: selection.height,
              }}
            />
          ) : null}

          <div className="capture-overlay__hint">Drag to select an area for capture.</div>
        </div>
      ) : null}

      {phase === 'loading' ? (
        <div className="capture-overlay__center-copy">Preparing capture preview...</div>
      ) : null}

      {phase === 'preview' && previewUrl ? (
        <div className="capture-overlay__preview-shell">
          <div className="capture-overlay__preview-card">
            <div className="capture-overlay__preview-grid">
              <div className="capture-overlay__preview-image">
                <img src={previewUrl} alt="Capture preview" className="capture-overlay__image" />
              </div>

              <div className="capture-overlay__preview-sidebar">
                <div>
                  <div className="app-kicker">Capture Preview</div>
                  <p className="capture-overlay__copy">
                    Confirm to store this image as an internal result asset and attach it to the
                    current record.
                  </p>
                </div>

                {error ? <div className="capture-overlay__error">{error}</div> : null}

                <div className="capture-overlay__actions">
                  <Button disabled={busy} onClick={handleConfirmCapture}>
                    {busy ? 'Saving...' : 'Confirm Capture'}
                  </Button>
                  <Button
                    onClick={() => {
                      setPreviewUrl(null);
                      setPhase('selecting');
                      setError(null);
                    }}
                  >
                    Retake
                  </Button>
                  <Button
                    onClick={() => {
                      void windowRef.current.close();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {error && phase !== 'preview' ? (
        <div className="capture-overlay__error-floating">{error}</div>
      ) : null}
    </div>
  );
}

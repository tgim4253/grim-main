import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../../shared/ui';
import { useKeybindings, usePointerSelection } from '../../../shared/hooks';
import type { CaptureContext, CaptureMonitor, CaptureRect } from '../../../shared/types';
import { ipc } from '../../../shared/lib/ipc';
import './capture.css';

type OverlayPhase = 'loading' | 'selecting' | 'preview';
type CaptureMode = 'freeform' | 'square';

type PointerPoint = {
  x: number;
  y: number;
};

type TauriMonitor = NonNullable<Awaited<ReturnType<typeof currentMonitor>>>;

const MIN_SELECTION_SIZE = 12;
const IDLE_OVERLAY_COLOR = 'rgba(0, 0, 0, 0.35)';
const ACTIVE_OVERLAY_COLOR = 'rgba(0, 0, 0, 0)';

const parseOptionalNumber = (value: string | null): number | null => {
  if (value === null || value.trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normaliseRect = (rect: CaptureRect, monitor: CaptureMonitor): CaptureRect => {
  const x = Math.max(0, Math.min(rect.x, Math.max(0, monitor.width - 1)));
  const y = Math.max(0, Math.min(rect.y, Math.max(0, monitor.height - 1)));
  const width = Math.max(1, Math.min(rect.width, monitor.width - x));
  const height = Math.max(1, Math.min(rect.height, monitor.height - y));

  return { x, y, width, height };
};

const normaliseScaleFactor = (scaleFactor: number): number => {
  if (Number.isFinite(scaleFactor) && scaleFactor > 0) {
    return scaleFactor;
  }

  const fallbackScale = window.devicePixelRatio || 1;
  return Number.isFinite(fallbackScale) && fallbackScale > 0 ? fallbackScale : 1;
};

const createCaptureMonitor = (current: TauriMonitor): CaptureMonitor => {
  const scaleFactor = normaliseScaleFactor(current.scaleFactor);
  const position = current.position.toLogical(scaleFactor);
  const size = current.size.toLogical(scaleFactor);

  return {
    x: Math.round(position.x),
    y: Math.round(position.y),
    width: Math.max(1, Math.round(size.width)),
    height: Math.max(1, Math.round(size.height)),
    scaleFactor,
  };
};

const createViewportCaptureMonitor = (): CaptureMonitor => ({
  x: 0,
  y: 0,
  width: Math.max(1, Math.round(window.innerWidth)),
  height: Math.max(1, Math.round(window.innerHeight)),
  scaleFactor: normaliseScaleFactor(window.devicePixelRatio || 1),
});

const resolveLogicalWindowOffset = (
  position: Awaited<ReturnType<ReturnType<typeof getCurrentWindow>['innerPosition']>>,
  monitor: CaptureMonitor,
): PointerPoint => {
  const scaleFactor = normaliseScaleFactor(monitor.scaleFactor);
  const logicalPosition = position.toLogical(scaleFactor);

  return {
    x: logicalPosition.x - monitor.x,
    y: logicalPosition.y - monitor.y,
  };
};

const waitForOverlayPaint = () =>
  new Promise<void>(resolve => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        resolve();
      });
    });
  });

async function copyPreviewImageToClipboard(previewUrl: string) {
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (typeof ClipboardItem === 'undefined' || typeof clipboard?.write !== 'function') {
    throw new Error('Image clipboard writes are unavailable.');
  }

  const response = await fetch(previewUrl);
  if (!response.ok) {
    throw new Error('Failed to load capture preview for clipboard.');
  }

  const blob = await response.blob();
  const mimeType = blob.type.startsWith('image/') ? blob.type : 'image/png';
  await clipboard.write([new ClipboardItem({ [mimeType]: blob })]);
}

export function CaptureOverlay() {
  const { t } = useTranslation('common');
  const [params] = useSearchParams();
  const [monitor, setMonitor] = useState<CaptureMonitor | null>(null);
  const [phase, setPhase] = useState<OverlayPhase>('loading');
  const [mode, setMode] = useState<CaptureMode>('freeform');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowOffset, setWindowOffset] = useState<PointerPoint>({ x: 0, y: 0 });

  const windowRef = useRef(getCurrentWindow());
  const phaseRef = useRef(phase);
  const isMountedRef = useRef(true);
  const renderingPreviewRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, [t]);

  const context = useMemo<CaptureContext>(
    () => ({
      sessionId: params.get('session_id'),
      recordId: params.get('record_id'),
      assetId: params.get('asset_id'),
      targetSeconds: parseOptionalNumber(params.get('target_seconds')),
      actualSeconds: parseOptionalNumber(params.get('actual_seconds')),
      resultSavePath: params.get('result_save_path'),
    }),
    [params],
  );

  useEffect(() => {
    const body = document.body;
    const root = document.getElementById('root');
    const html = document.documentElement;
    const previousBodyBackground = body.style.background;
    const previousCursor = body.style.cursor;
    const previousOpacity = body.style.opacity;
    const previousUserSelect = body.style.userSelect;
    const previousRootBackground = root?.style.background;
    const previousHtmlBackground = html.style.background;

    html.style.background = 'transparent';
    if (root) {
      root.style.background = 'transparent';
    }
    body.style.background = IDLE_OVERLAY_COLOR;
    body.style.userSelect = 'none';

    return () => {
      body.style.background = previousBodyBackground;
      body.style.cursor = previousCursor;
      body.style.opacity = previousOpacity;
      body.style.userSelect = previousUserSelect;
      html.style.background = previousHtmlBackground;
      if (root) {
        root.style.background = previousRootBackground ?? '';
      }
    };
  }, []);

  useEffect(() => {
    document.body.style.cursor = phase === 'selecting' ? 'crosshair' : 'default';
    return () => {
      document.body.style.cursor = 'default';
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

        setMonitor(current ? createCaptureMonitor(current) : createViewportCaptureMonitor());
        setPhase('selecting');
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        setMonitor(createViewportCaptureMonitor());
        setPhase('selecting');
        setError(
          nextError instanceof Error
            ? nextError.message
            : t('capture.error.resolve_monitor', { defaultValue: 'Failed to resolve monitor' }),
        );
      }
    };

    void resolveMonitor();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!monitor) {
      return;
    }

    let cancelled = false;

    const resolveWindowOffset = async () => {
      try {
        const position = await windowRef.current.innerPosition();
        if (cancelled) {
          return;
        }

        setWindowOffset(resolveLogicalWindowOffset(position, monitor));
      } catch (nextError) {
        console.warn('Failed to resolve capture window offset', nextError);
        if (!cancelled) {
          setWindowOffset({ x: 0, y: 0 });
        }
      }
    };

    void resolveWindowOffset();
    return () => {
      cancelled = true;
    };
  }, [monitor]);

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
    mode,
    minSize: MIN_SELECTION_SIZE,
    disabled: phase !== 'selecting' || busy,
    onSelectionStart: () => {
      setError(null);
      document.body.style.background = ACTIVE_OVERLAY_COLOR;
    },
    onSelectionCancel: () => {
      document.body.style.background = IDLE_OVERLAY_COLOR;
    },
    onSelectionInvalid: () => {
      document.body.style.background = IDLE_OVERLAY_COLOR;
    },
  });

  useEffect(() => {
    if (!completedSelection || phaseRef.current !== 'selecting' || renderingPreviewRef.current) {
      return;
    }

    const renderPreview = async () => {
      if (!monitor) {
        clearCompletedSelection();
        resetSelection();
        return;
      }

      renderingPreviewRef.current = true;
      setBusy(true);
      setError(null);
      setPhase('loading');

      const body = document.body;
      const previousOpacity = body.style.opacity;

      try {
        body.style.opacity = '0';
        await waitForOverlayPaint();

        let offsetX = windowOffset.x;
        let offsetY = windowOffset.y;
        try {
          const position = await windowRef.current.innerPosition();
          const nextWindowOffset = resolveLogicalWindowOffset(position, monitor);
          offsetX = nextWindowOffset.x;
          offsetY = nextWindowOffset.y;
          setWindowOffset({ x: offsetX, y: offsetY });
        } catch (nextError) {
          console.warn('Failed to refresh capture window offset', nextError);
        }

        const rect = completedSelection;
        const logicalRect = normaliseRect(
          {
            x: Math.round(rect.x + offsetX),
            y: Math.round(rect.y + offsetY),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          monitor,
        );
        const preview = await ipc.capture.renderPreview({ rect: logicalRect, monitor });
        if (!isMountedRef.current) {
          return;
        }

        setPreviewUrl(preview.baseUrl);
        resetSelection();
        setPhase('preview');
      } catch (nextError) {
        if (isMountedRef.current) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : t('capture.error.render_preview', { defaultValue: 'Failed to render preview' }),
          );
          resetSelection();
          setPhase('selecting');
        }
      } finally {
        body.style.opacity = previousOpacity;
        renderingPreviewRef.current = false;
        if (isMountedRef.current) {
          document.body.style.background = IDLE_OVERLAY_COLOR;
          setBusy(false);
          clearCompletedSelection();
        }
      }
    };

    void renderPreview();
  }, [clearCompletedSelection, completedSelection, monitor, resetSelection, t, windowOffset]);

  const handleRetake = useCallback(() => {
    resetSelection();
    setPreviewUrl(null);
    setError(null);
    setPhase('selecting');
    document.body.style.background = IDLE_OVERLAY_COLOR;
  }, [resetSelection]);

  const handleCancel = useCallback(async () => {
    await windowRef.current.close();
  }, []);

  const handleConfirmCapture = useCallback(async () => {
    if (previewUrl === null) {
      return;
    }

    if (!context.recordId) {
      setError(
        t('capture.error.requires_saved_record', {
          defaultValue: 'Capture requires a saved record.',
        }),
      );
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await ipc.capture.confirm({ baseUrl: previewUrl, context });
      await windowRef.current.close();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : t('capture.error.confirm_capture', { defaultValue: 'Failed to confirm capture' }),
      );
      setBusy(false);
    }
  }, [context, previewUrl, t]);

  const handleResetSelection = useCallback(() => {
    if (phase === 'preview') {
      handleRetake();
      return;
    }

    resetSelection();
    clearCompletedSelection();
    setError(null);
    document.body.style.background = IDLE_OVERLAY_COLOR;
  }, [clearCompletedSelection, handleRetake, phase, resetSelection]);

  const handleCopyPreview = useCallback(() => {
    if (!previewUrl) {
      return;
    }

    void copyPreviewImageToClipboard(previewUrl).catch((nextError: unknown) => {
      setError(
        nextError instanceof Error
          ? nextError.message
          : t('capture.error.copy_preview', {
              defaultValue: 'Failed to copy capture preview.',
            }),
      );
    });
  }, [previewUrl, t]);

  useKeybindings({
    context: {
      captureOverlayOpen: true,
      capturePreview: phase === 'preview' && previewUrl !== null,
      hasSelection: Boolean(selection || completedSelection || previewUrl),
    },
    handlers: {
      'grim.capture.cancel': () => {
        void handleCancel();
      },
      'grim.capture.confirm': () => {
        void handleConfirmCapture();
      },
      'grim.capture.copyPreview': handleCopyPreview,
      'grim.capture.resetSelection': handleResetSelection,
    },
  });

  const stopPointerPropagation = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  const renderSelectionOverlay = () => {
    if (!selection || phase !== 'selecting') {
      return null;
    }

    return (
      <div
        className="capture-overlay__selection-box"
        style={{
          left: `${String(selection.x)}px`,
          top: `${String(selection.y)}px`,
          width: `${String(selection.width)}px`,
          height: `${String(selection.height)}px`,
        }}
      >
        <div className="capture-overlay__selection-size">
          {String(Math.round(selection.width))} x {String(Math.round(selection.height))}
        </div>
      </div>
    );
  };

  const renderPreview = () => {
    if (phase !== 'preview') {
      return null;
    }

    return (
      <div className="capture-overlay__preview-shell">
        <div className="capture-overlay__preview-card" onPointerDown={stopPointerPropagation}>
          <div className="capture-overlay__preview-image">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={t('capture.preview_alt', { defaultValue: 'Capture preview' })}
                className="capture-overlay__image"
              />
            ) : (
              <div className="capture-overlay__center-copy">
                {t('capture.preparing_preview', {
                  defaultValue: 'Preparing capture preview...',
                })}
              </div>
            )}
          </div>

          {error ? <div className="capture-overlay__error">{error}</div> : null}

          <div className="capture-overlay__preview-actions">
            <Button variant="secondary" disabled={busy} onClick={handleRetake}>
              {t('capture.retake', { defaultValue: 'Retake' })}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                void handleCancel();
              }}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button disabled={busy} onClick={() => void handleConfirmCapture()}>
              {busy
                ? t('common.saving', { defaultValue: 'Saving...' })
                : t('common.confirm', { defaultValue: 'Confirm' })}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderBottomControls = () => {
    if (phase === 'preview') {
      return null;
    }

    const disabled = busy || phase === 'loading';

    return (
      <div className="capture-overlay__bottom-controls">
        <div className="capture-overlay__controls" onPointerDown={stopPointerPropagation}>
          <Button
            variant="secondary"
            aria-pressed={mode === 'freeform'}
            className="capture-overlay__mode-button"
            disabled={disabled}
            onClick={() => {
              setMode('freeform');
            }}
          >
            {t('capture.mode.freeform', { defaultValue: 'Freeform' })}
          </Button>
          <Button
            variant="secondary"
            aria-pressed={mode === 'square'}
            className="capture-overlay__mode-button"
            disabled={disabled}
            onClick={() => {
              setMode('square');
            }}
          >
            {t('capture.mode.square', { defaultValue: 'Square' })}
          </Button>
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => {
              void handleCancel();
            }}
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div
      className="capture-overlay"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
    >
      <div className="capture-overlay__base" />

      {phase === 'loading' ? (
        <div className="capture-overlay__center-copy">
          {busy
            ? t('capture.processing', { defaultValue: 'Processing capture...' })
            : t('capture.preparing_window', { defaultValue: 'Preparing capture window...' })}
        </div>
      ) : null}

      <div className="capture-overlay__hint">
        {phase === 'selecting'
          ? t('capture.hint.selecting', { defaultValue: 'Drag to select the area to capture.' })
          : phase === 'preview'
            ? t('capture.hint.preview', {
                defaultValue: 'Review the capture and confirm or retake.',
              })
            : t('capture.preparing_window', { defaultValue: 'Preparing capture window...' })}
      </div>

      {renderSelectionOverlay()}
      {renderPreview()}
      {renderBottomControls()}

      {error && phase !== 'preview' ? (
        <div className="capture-overlay__error-floating">{error}</div>
      ) : null}
    </div>
  );
}

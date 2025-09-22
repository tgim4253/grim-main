import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { Button } from '@tgim/ui';
import {
  CroquisCaptureMode,
  CroquisCaptureSelection,
  CroquisSession,
  CroquisSessionImage,
} from '@tgim/types/croquis';
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Camera,
  Check,
  X,
  Square,
  Maximize2,
  Crop,
  Undo2,
  Loader2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { ipc } from '../../lib/ipc';

const shuffleImages = (images: CroquisSessionImage[]): CroquisSessionImage[] => {
  const next = [...images];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const MIN_SELECTION_PX = 12;

interface CaptureLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

type CapturePhase = 'selecting' | 'preview';

interface CaptureContext {
  phase: CapturePhase;
  mode: CroquisCaptureMode;
  selection: CroquisCaptureSelection | null;
  image: CroquisSessionImage;
  layout: CaptureLayout;
}

const CroquisWindow: React.FC = () => {
  const [params] = useSearchParams();
  const [session, setSession] = useState<CroquisSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);
  const [isHover, setIsHover] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const startTimestampRef = useRef<number | null>(null);

  const [capture, setCapture] = useState<CaptureContext | null>(null);
  const captureRef = useRef<CaptureContext | null>(null);
  const captureStageRectRef = useRef<DOMRect | null>(null);
  const capturePointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const captureActiveRef = useRef(false);
  const [capturePreviewUrl, setCapturePreviewUrl] = useState<string | null>(null);
  const [savingCapture, setSavingCapture] = useState(false);

  useEffect(() => {
    captureRef.current = capture;
  }, [capture]);

  useEffect(() => {
    console.log('[Croquis] window mounted');
    document.body.style.backgroundColor = 'transparent';
  }, []);

  useEffect(() => {
    const sessionId = params.get('session_id');
    if (!sessionId) {
      console.warn('[Croquis] Missing session_id query parameter');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const data = await ipc.croquis.loadSession(sessionId);
        if (!data) {
          console.warn('[Croquis] No session found for id', sessionId);
          return;
        }
        if (cancelled) return;
        setSession(data);
        console.log('[Croquis] session hydrated', data);
      } catch (error) {
        console.error('[Croquis] Failed to load Croquis session', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params]);

  const option = session?.option;
  const autoSkip = option?.auto?.isSkip ?? false;
  const isCaptureEnabled = option?.isCapture ?? false;
  const isGray = option?.isGray ?? false;

  const imageList = useMemo(() => {
    if (!session) return [];
    const base = session.images ?? [];
    if (!base.length) return [];
    if (session.option?.isShuffle) return shuffleImages(base);
    return [...base];
  }, [session]);

  useEffect(() => {
    setCurrentIndex(prev => (imageList.length ? Math.min(prev, imageList.length - 1) : 0));
  }, [imageList]);

  const [isInitHeight, setIsInitHeight] = useState(false);
  useEffect(() => {
    (async () => {
      if (isInitHeight) return;
      const el = imgRef.current;
      if (!el) return;

      const naturalH = el.naturalHeight || el.height;
      const naturalW = el.naturalWidth || el.width;
      if (!naturalH) return;

      try {
        const windowRef = getCurrentWindow();

        const fixedWidth = Number(option?.window.width!);
        const desiredHeight = Math.max(1, (Math.round(naturalH) * fixedWidth) / naturalW);

        await windowRef.setSize(new LogicalSize(fixedWidth, desiredHeight));
        setIsInitHeight(true);
      } catch (error) {
        console.error('[Croquis] Failed to apply window size to image', error);
      }
    })();
  }, [imageList, imgRef.current, option, isInitHeight]);

  const maxTimeSecondsRaw = option?.timer?.maxTime ?? 0;
  const maxTimeSeconds = Number.isFinite(maxTimeSecondsRaw) ? Math.max(0, maxTimeSecondsRaw) : 0;
  const maxTimeMs = maxTimeSeconds > 0 ? maxTimeSeconds * 1000 : 0;

  const handleTimerComplete = useCallback(() => {
    setIsPlaying(false);
    setTimerExpired(true);
    if (autoSkip && imageList.length > 0) {
      setCurrentIndex(prev => (prev >= imageList.length - 1 ? prev : prev + 1));
    }
  }, [autoSkip, imageList.length]);

  const updateLoop = useCallback(
    (timestamp: number) => {
      if (startTimestampRef.current === null) {
        startTimestampRef.current = timestamp - elapsedRef.current;
      }
      const nextElapsed = timestamp - startTimestampRef.current;
      elapsedRef.current = nextElapsed;
      if (maxTimeMs > 0 && nextElapsed >= maxTimeMs) {
        setElapsedMs(maxTimeMs);
        elapsedRef.current = maxTimeMs;
        startTimestampRef.current = null;
        rafRef.current = null;
        handleTimerComplete();
        return;
      }
      setElapsedMs(nextElapsed);
      rafRef.current = requestAnimationFrame(updateLoop);
    },
    [handleTimerComplete, maxTimeMs],
  );

  const resetTimer = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    elapsedRef.current = 0;
    startTimestampRef.current = null;
    setElapsedMs(0);
    setIsPlaying(false);
    setTimerExpired(false);
  }, []);

  const startTimer = useCallback(() => {
    if (rafRef.current !== null) return;
    setTimerExpired(false);
    setIsPlaying(true);
    startTimestampRef.current = null;
    rafRef.current = requestAnimationFrame(updateLoop);
  }, [updateLoop]);

  const pauseTimer = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    startTimestampRef.current = null;
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    if (!session || !imageList.length) return;
    resetTimer();
    startTimer();
  }, [session, imageList, currentIndex, resetTimer, startTimer]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  const currentImage = imageList[currentIndex] ?? null;
  const currentImageSrc = useMemo(
    () => (currentImage ? convertFileSrc(currentImage.basePath) : null),
    [currentImage],
  );

  const hasPrev = currentIndex > 0;
  const hasNext = imageList.length > 0 && currentIndex < imageList.length - 1;
  const transportDisabled = Boolean(capture);

  const handlePrev = useCallback(() => {
    if (!hasPrev || transportDisabled) return;
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, [hasPrev, transportDisabled]);

  const handleNext = useCallback(() => {
    if (!hasNext || transportDisabled) return;
    setCurrentIndex(prev => Math.min(imageList.length - 1, prev + 1));
  }, [hasNext, imageList.length, transportDisabled]);

  const handleCaptureCancel = useCallback(() => {
    captureActiveRef.current = false;
    capturePointerStartRef.current = null;
    setCapture(null);
    setCapturePreviewUrl(null);
  }, []);

  const handleCaptureRetake = useCallback(() => {
    captureActiveRef.current = false;
    capturePointerStartRef.current = null;
    setCapture(prev => (prev ? { ...prev, phase: 'selecting', selection: null } : prev));
    setCapturePreviewUrl(null);
  }, []);

  const ensureLayout = useCallback((): CaptureLayout | null => {
    const stageRect = stageRef.current?.getBoundingClientRect();
    const imageRect = imgRef.current?.getBoundingClientRect();
    if (!stageRect || !imageRect) return null;
    captureStageRectRef.current = stageRect;
    return {
      left: imageRect.left - stageRect.left,
      top: imageRect.top - stageRect.top,
      width: imageRect.width,
      height: imageRect.height,
    };
  }, []);

  const handleCaptureStart = useCallback(() => {
    if (!currentImage || !isCaptureEnabled || !session) return;
    const layout = ensureLayout();
    if (!layout || layout.width <= 0 || layout.height <= 0) {
      toast.error('Image layout is not ready yet. Please try again.');
      return;
    }
    pauseTimer();
    setCapture({
      phase: 'selecting',
      mode: 'freeform',
      selection: null,
      image: currentImage,
      layout,
    });
  }, [currentImage, ensureLayout, isCaptureEnabled, pauseTimer, session]);

  useEffect(() => {
    if (!capture) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCaptureCancel();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [capture, handleCaptureCancel]);

  useEffect(() => {
    if (capture && currentImage && capture.image.hash !== currentImage.hash) {
      handleCaptureCancel();
    }
  }, [capture, currentImage, handleCaptureCancel]);

  const updateSelection = useCallback((next: { x: number; y: number }) => {
    const state = captureRef.current;
    const start = capturePointerStartRef.current;
    if (!state || !start) return;
    const layout = state.layout;
    const startX = clamp(start.x, 0, layout.width);
    const startY = clamp(start.y, 0, layout.height);
    const currentX = clamp(next.x, 0, layout.width);
    const currentY = clamp(next.y, 0, layout.height);

    let leftPx = Math.min(startX, currentX);
    let topPx = Math.min(startY, currentY);
    let widthPx = Math.abs(currentX - startX);
    let heightPx = Math.abs(currentY - startY);

    if (state.mode === 'square') {
      const size = Math.min(widthPx, heightPx);
      if (size > 0) {
        const centerX = leftPx + widthPx / 2;
        const centerY = topPx + heightPx / 2;
        widthPx = size;
        heightPx = size;
        leftPx = clamp(centerX - size / 2, 0, layout.width - size);
        topPx = clamp(centerY - size / 2, 0, layout.height - size);
      }
    }

    widthPx = clamp(widthPx, 0, layout.width - leftPx);
    heightPx = clamp(heightPx, 0, layout.height - topPx);

    const selection: CroquisCaptureSelection = {
      left: layout.width > 0 ? clamp(leftPx / layout.width, 0, 1) : 0,
      top: layout.height > 0 ? clamp(topPx / layout.height, 0, 1) : 0,
      width: layout.width > 0 ? clamp(widthPx / layout.width, 0, 1) : 0,
      height: layout.height > 0 ? clamp(heightPx / layout.height, 0, 1) : 0,
    };

    setCapture(prev => (prev ? { ...prev, selection } : prev));
  }, []);

  const handleCapturePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = captureRef.current;
    if (!state || state.phase !== 'selecting') return;
    const stageRect = captureStageRectRef.current ?? stageRef.current?.getBoundingClientRect();
    const layout = state.layout;
    if (!stageRect || layout.width <= 0 || layout.height <= 0) return;

    captureStageRectRef.current = stageRect;

    const stageX = event.clientX - stageRect.left;
    const stageY = event.clientY - stageRect.top;
    const localX = stageX - layout.left;
    const localY = stageY - layout.top;
    if (localX < 0 || localY < 0 || localX > layout.width || localY > layout.height) return;

    captureActiveRef.current = true;
    capturePointerStartRef.current = { x: localX, y: localY };
    setCapture(prev => (prev ? { ...prev, selection: null } : prev));
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleCapturePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!captureActiveRef.current) return;
      const state = captureRef.current;
      if (!state || state.phase !== 'selecting') return;
      const stageRect = captureStageRectRef.current ?? stageRef.current?.getBoundingClientRect();
      const layout = state.layout;
      if (!stageRect || layout.width <= 0 || layout.height <= 0) return;

      const stageX = event.clientX - stageRect.left;
      const stageY = event.clientY - stageRect.top;
      const next = {
        x: stageX - layout.left,
        y: stageY - layout.top,
      };
      updateSelection(next);
      event.preventDefault();
      event.stopPropagation();
    },
    [updateSelection],
  );

  const finaliseSelection = useCallback(() => {
    const state = captureRef.current;
    if (!state || !state.selection) {
      setCapture(prev => (prev ? { ...prev, selection: null } : prev));
      return;
    }
    const layout = state.layout;
    const widthPx = state.selection.width * layout.width;
    const heightPx = state.selection.height * layout.height;
    if (widthPx < MIN_SELECTION_PX || heightPx < MIN_SELECTION_PX) {
      toast.info('Selection is too small. Try selecting a larger area.');
      setCapture(prev => (prev ? { ...prev, selection: null } : prev));
      return;
    }
    setCapture(prev => (prev ? { ...prev, phase: 'preview' } : prev));
  }, []);

  const handleCapturePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!captureActiveRef.current) return;
      captureActiveRef.current = false;
      capturePointerStartRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finaliseSelection();
      event.preventDefault();
      event.stopPropagation();
    },
    [finaliseSelection],
  );

  const handleCapturePointerCancel = useCallback(() => {
    if (!captureActiveRef.current) return;
    captureActiveRef.current = false;
    capturePointerStartRef.current = null;
  }, []);

  const handleCaptureModeChange = useCallback((mode: CroquisCaptureMode) => {
    setCapture(prev => (prev ? { ...prev, mode, selection: null } : prev));
    capturePointerStartRef.current = null;
    captureActiveRef.current = false;
  }, []);

  const handleCaptureFullImage = useCallback(() => {
    const state = captureRef.current;
    if (!state) return;
    setCapture(prev =>
      prev
        ? {
            ...prev,
            mode: 'full',
            phase: 'preview',
            selection: { left: 0, top: 0, width: 1, height: 1 },
          }
        : prev,
    );
  }, []);

  useEffect(() => {
    const state = captureRef.current;
    if (!state || state.phase !== 'preview' || !state.selection) {
      setCapturePreviewUrl(null);
      return;
    }
    const previewSource = convertFileSrc(state.image.basePath);
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      const sx = state.selection.left * image.naturalWidth;
      const sy = state.selection.top * image.naturalHeight;
      const sw = state.selection.width * image.naturalWidth;
      const sh = state.selection.height * image.naturalHeight;
      const width = Math.max(1, Math.round(sw));
      const height = Math.max(1, Math.round(sh));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
      const url = canvas.toDataURL('image/png');
      setCapturePreviewUrl(url);
    };
    image.onerror = () => {
      if (!cancelled) {
        console.warn('[Croquis] Failed to prepare capture preview');
        setCapturePreviewUrl(null);
      }
    };
    image.src = previewSource;
    return () => {
      cancelled = true;
    };
  }, [capture]);

  const handleCaptureConfirm = useCallback(async () => {
    const state = captureRef.current;
    if (!state || !state.selection || !session) return;
    if (!session.sessionId) {
      toast.error('Croquis session is not ready yet.');
      return;
    }
    setSavingCapture(true);
    try {
      await ipc.croquis.capture({
        sessionId: session.sessionId,
        imageHash: state.image.hash,
        mode: state.mode,
        selection: state.selection,
      });
      toast.success('Capture saved to workspace.');
      handleCaptureCancel();
    } catch (error) {
      console.error('[Croquis] Failed to save capture', error);
      toast.error('Failed to save capture. Please try again.');
    } finally {
      setSavingCapture(false);
    }
  }, [handleCaptureCancel, session]);

  const progress = useMemo(
    () => (maxTimeMs > 0 ? Math.min(elapsedMs / maxTimeMs, 1) : 0),
    [elapsedMs, maxTimeMs],
  );
  const isCritical = timerExpired || progress >= 0.9;

  const captureSelection = capture?.selection ?? null;
  const captureLayout = capture?.layout ?? null;
  const selectionPx = useMemo(() => {
    if (!captureSelection || !captureLayout) return null;
    return {
      left: captureLayout.left + captureSelection.left * captureLayout.width,
      top: captureLayout.top + captureSelection.top * captureLayout.height,
      width: captureSelection.width * captureLayout.width,
      height: captureSelection.height * captureLayout.height,
    };
  }, [captureSelection, captureLayout]);

  const selectionDisplay = useMemo(() => {
    if (!captureSelection || !capture?.image) return null;
    const width = Math.round(captureSelection.width * capture.image.baseWidth);
    const height = Math.round(captureSelection.height * capture.image.baseHeight);
    return `${width} × ${height}`;
  }, [captureSelection, capture?.image]);

  return (
    <div className="flex h-full w-full flex-col text-text">
      <main
        className="relative flex h-full w-full flex-1 select-none bg-transparent flex-col"
        onMouseEnter={() => setIsHover(true)}
        onMouseLeave={() => setIsHover(false)}
      >
        <div
          ref={stageRef}
          className="relative flex h-full w-full items-center justify-center overflow-hidden"
        >
          {currentImage && currentImageSrc ? (
            <img
              key={currentImage.hash}
              ref={imgRef}
              src={currentImageSrc}
              alt={currentImage.hash}
              className="h-full w-full object-contain"
              style={{ filter: isGray ? 'grayscale(100%)' : 'none' }}
            />
          ) : (
            <div className="text-sm text-text-soft">Waiting for Croquis data...</div>
          )}

          {capture && (
            <div className="absolute inset-0 z-30 flex flex-col">
              <div
                className="relative flex-1"
                style={{ cursor: capture.phase === 'selecting' ? 'crosshair' : 'default' }}
                onPointerDown={capture.phase === 'selecting' ? handleCapturePointerDown : undefined}
                onPointerMove={capture.phase === 'selecting' ? handleCapturePointerMove : undefined}
                onPointerUp={capture.phase === 'selecting' ? handleCapturePointerUp : undefined}
                onPointerLeave={capture.phase === 'selecting' ? handleCapturePointerUp : undefined}
                onPointerCancel={
                  capture.phase === 'selecting' ? handleCapturePointerCancel : undefined
                }
              >
                <div className="absolute inset-0 bg-black/50" style={{ pointerEvents: 'none' }} />
                {captureLayout && (
                  <div
                    className="absolute"
                    style={{
                      left: captureLayout.left,
                      top: captureLayout.top,
                      width: captureLayout.width,
                      height: captureLayout.height,
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {selectionPx && (
                  <div
                    className="absolute rounded-sm border-2 border-accent/90"
                    style={{
                      left: selectionPx.left,
                      top: selectionPx.top,
                      width: selectionPx.width,
                      height: selectionPx.height,
                      boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                    }}
                  >
                    {selectionDisplay && (
                      <div className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
                        {selectionDisplay}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-end p-6">
                <div className="pointer-events-auto w-full max-w-[520px]">
                  {capture.phase === 'selecting' ? (
                    <div className="rounded-lg bg-surface/90 p-4 text-sm shadow-lg backdrop-blur">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-soft">
                        Choose capture area
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={capture.mode === 'freeform' ? 'primary' : 'secondary'}
                          onClick={() => handleCaptureModeChange('freeform')}
                          className="flex items-center gap-2"
                        >
                          <Crop className="size-4" />
                          Freeform
                        </Button>
                        <Button
                          type="button"
                          variant={capture.mode === 'square' ? 'primary' : 'secondary'}
                          onClick={() => handleCaptureModeChange('square')}
                          className="flex items-center gap-2"
                        >
                          <Square className="size-4" />
                          Square
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleCaptureFullImage}
                          className="flex items-center gap-2"
                        >
                          <Maximize2 className="size-4" />
                          Full image
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleCaptureCancel}
                          className="ml-auto flex items-center gap-2"
                        >
                          <X className="size-4" />
                          Cancel
                        </Button>
                      </div>
                      <p className="mt-3 text-xs text-text-soft">
                        Drag across the reference to define the capture. Use the buttons above for
                        quick presets.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-surface/95 p-4 text-sm shadow-xl backdrop-blur">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-soft">
                        Preview capture
                      </div>
                      <div className="flex flex-col gap-3">
                        <div className="flex h-48 w-full items-center justify-center overflow-hidden rounded border border-surface-muted bg-surface-muted/30">
                          {capturePreviewUrl ? (
                            <img
                              src={capturePreviewUrl}
                              alt="Capture preview"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : (
                            <div className="flex items-center gap-2 text-xs text-text-soft">
                              <Loader2 className="size-4 animate-spin" /> Preparing preview…
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="primary"
                            onClick={handleCaptureConfirm}
                            disabled={savingCapture}
                            className="flex items-center gap-2"
                          >
                            {savingCapture ? (
                              <>
                                <Loader2 className="size-4 animate-spin" /> Saving…
                              </>
                            ) : (
                              <>
                                <Check className="size-4" /> Save capture
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={handleCaptureRetake}
                            disabled={savingCapture}
                            className="flex items-center gap-2"
                          >
                            <Undo2 className="size-4" /> Retake
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={handleCaptureCancel}
                            disabled={savingCapture}
                            className="ml-auto flex items-center gap-2"
                          >
                            <X className="size-4" /> Cancel
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="pointer-events-none flex w-full items-center justify-center">
          <div className="w-full max-w-[720px]">
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-muted">
              <div
                className={`h-full ${isCritical ? 'bg-red-500' : 'bg-accent'}`}
                style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
              />
            </div>
          </div>
        </div>

        <div
          className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-4 transition-opacity duration-200 ${
            capture ? 'opacity-0' : isHover ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div
            className="absolute pointer-events-none flex w-full items-end justify-center"
            style={{ bottom: 10 }}
          >
            <div className="pointer-events-auto flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handlePrev}
                disabled={!hasPrev || transportDisabled}
                className="flex items-center gap-2"
              >
                <SkipBack className="size-4" />
              </Button>

              {isPlaying ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={pauseTimer}
                  disabled={transportDisabled}
                  className="flex items-center gap-2"
                >
                  <Pause className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  onClick={startTimer}
                  disabled={transportDisabled}
                  className="flex items-center gap-2"
                >
                  <Play className="size-4" />
                </Button>
              )}

              <Button
                type="button"
                variant="secondary"
                onClick={handleNext}
                disabled={!hasNext || transportDisabled}
                className="flex items-center gap-2"
              >
                <SkipForward className="size-4" />
              </Button>

              {!autoSkip && isCaptureEnabled && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCaptureStart}
                  disabled={transportDisabled || !currentImage}
                  className="flex items-center gap-2"
                >
                  <Camera className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CroquisWindow;

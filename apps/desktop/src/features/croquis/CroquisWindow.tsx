import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { Button } from '@tgim/ui';
import { CroquisSession, CroquisSessionImage } from '@tgim/types/croquis';
import { Minus, Pause, Play, SkipBack, SkipForward, Camera, X } from 'lucide-react';
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
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00';
  }
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
};

const CroquisWindow: React.FC = () => {
  const [params] = useSearchParams();
  const [session, setSession] = useState<CroquisSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);

  const rafRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const startTimestampRef = useRef<number | null>(null);

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
    if (!session) {
      return [];
    }
    const base = session.images ?? [];
    if (!base.length) {
      return [];
    }
    if (session.option?.isShuffle) {
      return shuffleImages(base);
    }
    return [...base];
  }, [session]);

  useEffect(() => {
    setCurrentIndex(prev => {
      if (!imageList.length) {
        return 0;
      }
      return Math.min(prev, imageList.length - 1);
    });
  }, [imageList]);

  useEffect(() => {
    if (!session) return;
    const { width, height } = session.option.window ?? {};
    const parsedWidth = width ? Number(width) : NaN;
    const parsedHeight = height ? Number(height) : NaN;
    const hasWidth = Number.isFinite(parsedWidth) && parsedWidth > 0;
    const hasHeight = Number.isFinite(parsedHeight) && parsedHeight > 0;
    if (!hasWidth && !hasHeight) {
      return;
    }

    void (async () => {
      try {
        const windowRef = getCurrentWindow();
        const currentSize = await windowRef.outerSize();
        const nextWidth = hasWidth ? parsedWidth : currentSize.width;
        const nextHeight = hasHeight ? parsedHeight : currentSize.height;
        await windowRef.setSize(new LogicalSize(nextWidth, nextHeight));
      } catch (error) {
        console.error('[Croquis] Failed to apply window size option', error);
      }
    })();
  }, [session]);

  const maxTimeSecondsRaw = option?.timer?.max_time ?? 0;
  const maxTimeSeconds = Number.isFinite(maxTimeSecondsRaw) ? Math.max(0, maxTimeSecondsRaw) : 0;
  const maxTimeMs = maxTimeSeconds > 0 ? maxTimeSeconds * 1000 : 0;

  const handleTimerComplete = useCallback(() => {
    setIsPlaying(false);
    setTimerExpired(true);
    if (autoSkip && imageList.length > 0) {
      setCurrentIndex(prev => {
        if (prev >= imageList.length - 1) {
          return prev;
        }
        return prev + 1;
      });
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
    if (rafRef.current !== null) {
      return;
    }
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
    if (!session || !imageList.length) {
      return;
    }
    resetTimer();
    startTimer();
  }, [session, imageList, currentIndex, resetTimer, startTimer]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const currentImage = imageList[currentIndex] ?? null;
  const currentImageSrc = useMemo(
    () => (currentImage ? convertFileSrc(currentImage.basePath) : null),
    [currentImage],
  );

  const hasPrev = currentIndex > 0;
  const hasNext = imageList.length > 0 && currentIndex < imageList.length - 1;

  const handlePrev = useCallback(() => {
    if (!hasPrev) return;
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, [hasPrev]);

  const handleNext = useCallback(() => {
    if (!hasNext) return;
    setCurrentIndex(prev => Math.min(imageList.length - 1, prev + 1));
  }, [hasNext, imageList.length]);

  const handleCapture = useCallback(() => {
    window.alert('Capture requested. (Not implemented yet)');
  }, []);

  const elapsedSeconds =
    maxTimeSeconds > 0 ? Math.min(maxTimeSeconds, elapsedMs / 1000) : elapsedMs / 1000;
  const progress = maxTimeMs > 0 ? Math.min(elapsedMs / maxTimeMs, 1) : 0;
  const isCritical = timerExpired || progress >= 0.9;

  return (
    <div className="flex h-full flex-col bg-surface text-text">
      <header
        className="flex h-8 items-center justify-between border-b border-border bg-shell-base/80 px-3 text-text backdrop-blur"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="text-sm font-semibold uppercase tracking-wide text-text-soft">
          Croquis Session
        </div>
        <div
          className="flex items-center"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <Button
            type="button"
            variant="titlebar"
            onClick={() => ipc.windowController.minimize()}
            aria-label="Minimize window"
            className="flex items-center justify-center text-icon-main hover:text-icon-hover-main"
          >
            <Minus className="size-4" />
          </Button>
          <Button
            type="button"
            variant="titlebar"
            onClick={() => ipc.windowController.close()}
            aria-label="Close window"
            className="flex items-center justify-center text-icon-main hover:text-icon-hover-main"
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex items-center justify-between text-sm text-text-soft">
          <span>
            {imageList.length > 0
              ? `Image ${currentIndex + 1} / ${imageList.length}`
              : 'Loading images...'}
          </span>
          <span>{option?.auto?.isSkip ? 'Auto skip mode' : 'Manual mode'}</span>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-muted shadow-inner">
          {currentImage && currentImageSrc ? (
            <img
              key={currentImage.hash}
              src={currentImageSrc}
              alt={currentImage.hash}
              className="max-h-full max-w-full object-contain"
              style={{ filter: isGray ? 'grayscale(100%)' : 'none' }}
            />
          ) : (
            <div className="text-sm text-text-soft">Waiting for Croquis data...</div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handlePrev}
            disabled={!hasPrev}
            className="flex items-center gap-2"
          >
            <SkipBack className="size-4" />
            Prev
          </Button>
          {isPlaying ? (
            <Button
              type="button"
              variant="secondary"
              onClick={pauseTimer}
              className="flex items-center gap-2"
            >
              <Pause className="size-4" />
              Pause
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={startTimer}
              className="flex items-center gap-2"
            >
              <Play className="size-4" />
              Start
            </Button>
          )}
          {!autoSkip && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleNext}
              disabled={!hasNext}
              className="flex items-center gap-2"
            >
              <SkipForward className="size-4" />
              Next
            </Button>
          )}
          {!autoSkip && isCaptureEnabled && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleCapture}
              className="flex items-center gap-2"
            >
              <Camera className="size-4" />
              Capture
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-text-soft">
            <span>
              {formatTime(elapsedSeconds)} / {formatTime(maxTimeSeconds)}
            </span>
            {maxTimeMs > 0 && <span>{Math.round(progress * 100)}%</span>}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={`h-full transition-[width,background-color] ${
                isCritical ? 'bg-red-500' : 'bg-accent'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default CroquisWindow;

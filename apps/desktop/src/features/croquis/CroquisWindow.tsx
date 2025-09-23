import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { Button } from '@tgim/ui';
import { CroquisSession, CroquisSessionImage } from '@tgim/types/croquis';
import { Pause, Play, SkipBack, SkipForward, Camera } from 'lucide-react';
import { ipc } from '../../lib/ipc';
import { platform } from '@tauri-apps/plugin-os';
import TitleBar from './layout/TitleBar';

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

const CroquisWindow: React.FC = () => {
  const [params] = useSearchParams();
  const [session, setSession] = useState<CroquisSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);
  const [isHover, setIsHover] = useState(false); // UI visible only on hover

  const imgRef = useRef<HTMLImageElement | null>(null); // reference to current <img>
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
    if (!session) return [];
    const base = session.images ?? [];
    if (!base.length) return [];
    if (session.option?.isShuffle) return shuffleImages(base);
    return [...base];
  }, [session]);

  useEffect(() => {
    setCurrentIndex(prev => (imageList.length ? Math.min(prev, imageList.length - 1) : 0));
  }, [imageList]);

  // Re-apply size when image loads or index changes
  // useEffect(() => {
  //   const el = imgRef.current;
  //   if (!el) return;

  //   const handle = () => void applyWindowSizeToImage();
  //   if (el.complete) handle();
  //   el.addEventListener('load', handle);
  //   el.addEventListener('error', handle);
  //   return () => {
  //     el.removeEventListener('load', handle);
  //     el.removeEventListener('error', handle);
  //   };
  // }, [applyWindowSizeToImage, currentIndex]);

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
  }, [imageList, imgRef.current, option]);

  // --- Timer logic ---
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

  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const os = await platform();
        if (mounted) setIsMac(os === 'macos');
      } catch {
        if (mounted) setIsMac(false);
      }
    })();
    return () => {
      mounted = false;
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
  const progress = useMemo(
    () => (maxTimeMs > 0 ? Math.min(elapsedMs / maxTimeMs, 1) : 0),
    [elapsedMs, maxTimeMs],
  );
  const isCritical = timerExpired || progress >= 0.9;

  return (
    <div className="flex h-full w-full flex-col text-text">
      {!isMac && (
        <div className="fixed w-full top-0 z-50">
          <TitleBar />
        </div>
      )}
      {/* Stage area */}
      <main
        className="relative flex h-full w-full flex-1 select-none bg-transparent flex-col"
        onMouseEnter={() => setIsHover(true)}
        onMouseLeave={() => setIsHover(false)}
      >
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
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

        {/* Absolute overlay controls (show on hover only) */}
        <div
          className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-4 transition-opacity duration-200 ${
            isHover ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Bottom transport controls */}
          <div
            className="absolute pointer-events-none flex w-full items-end justify-center"
            style={{ bottom: 10 }}
          >
            <div className="pointer-events-auto flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handlePrev}
                disabled={!hasPrev}
                className="flex items-center gap-2"
              >
                <SkipBack className="size-4" />
              </Button>

              {isPlaying ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={pauseTimer}
                  className="flex items-center gap-2"
                >
                  <Pause className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  onClick={startTimer}
                  className="flex items-center gap-2"
                >
                  <Play className="size-4" />
                </Button>
              )}

              <Button
                type="button"
                variant="secondary"
                onClick={handleNext}
                disabled={!hasNext}
                className="flex items-center gap-2"
              >
                <SkipForward className="size-4" />
              </Button>

              {!autoSkip && isCaptureEnabled && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCapture}
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

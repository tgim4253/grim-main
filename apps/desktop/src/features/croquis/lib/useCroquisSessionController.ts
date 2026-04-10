import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LogicalSize, getCurrentWindow } from '@tauri-apps/api/window';
import { ipc } from '../../../shared/lib/ipc';
import type { CroquisSession, CroquisSessionItem } from '../../../shared/types';
import { formatSeconds, shuffleItems, timestampNow } from './sessionUtils';

const sessionLoadCache = new Map<string, Promise<CroquisSession | null>>();

type UseCroquisSessionControllerParams = {
  sessionId: string | null;
};

export function useCroquisSessionController({ sessionId }: UseCroquisSessionControllerParams) {
  const [session, setSession] = useState<CroquisSession | null>(null);
  const [queue, setQueue] = useState<CroquisSessionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const intervalRef = useRef<number | null>(null);
  const recordStartRef = useRef<number>(Date.now());
  const startedIdsRef = useRef<Set<string>>(new Set());
  const finalizedIdsRef = useRef<Set<string>>(new Set());
  const currentItemRef = useRef<CroquisSessionItem | null>(null);
  const elapsedSecondsRef = useRef(0);

  useEffect(() => {
    if (!sessionId) {
      setStatus('Missing session identifier.');
      return;
    }

    let cancelled = false;
    const load = async () => {
      const cachedLoad =
        sessionLoadCache.get(sessionId) ??
        ipc.session.load(sessionId).finally(() => {
          // Keep the settled promise so StrictMode remounts do not consume the one-shot payload twice.
        });
      sessionLoadCache.set(sessionId, cachedLoad);

      const payload = await cachedLoad;
      if (cancelled) {
        return;
      }
      if (!payload) {
        setStatus('Croquis session payload is no longer available.');
        return;
      }

      const ordered = payload.option.isShuffle ? shuffleItems(payload.items) : payload.items;
      setSession(payload);
      setQueue(ordered);
      setCurrentIndex(0);
      setElapsedSeconds(0);
      setIsPlaying(true);
      setStatus(null);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const currentItem = currentIndex < queue.length ? queue[currentIndex] : null;
  const currentImageSrc = useMemo(
    () => (currentItem === null ? null : convertFileSrc(currentItem.sourcePath)),
    [currentItem],
  );
  const currentTargetSeconds =
    currentItem?.targetDurationSeconds ?? (session === null ? 0 : session.option.timer.maxTime);

  useEffect(() => {
    currentItemRef.current = currentItem;
  }, [currentItem]);

  useEffect(() => {
    elapsedSecondsRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  const finalizeItem = useCallback(
    async (
      item: CroquisSessionItem | null,
      durationSeconds: number,
      finalizedAt = timestampNow(),
    ) => {
      if (item === null || finalizedIdsRef.current.has(item.recordId)) {
        return;
      }

      finalizedIdsRef.current.add(item.recordId);
      await ipc.record.finalize({
        recordId: item.recordId,
        finishedAt: finalizedAt,
        finalizedAt,
        actualDurationSeconds: durationSeconds,
      });
    },
    [],
  );

  useEffect(() => {
    if (currentItem === null) {
      return;
    }

    const applyRecordStart = async () => {
      if (startedIdsRef.current.has(currentItem.recordId)) {
        return;
      }

      startedIdsRef.current.add(currentItem.recordId);
      await ipc.record.start(currentItem.recordId);
    };

    recordStartRef.current = Date.now();
    setElapsedSeconds(0);
    void applyRecordStart();
  }, [currentItem]);

  useEffect(() => {
    if (!isPlaying || currentItem === null) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = window.setInterval(() => {
      const nextSeconds = (Date.now() - recordStartRef.current) / 1000;
      setElapsedSeconds(nextSeconds);
    }, 100);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [currentItem, isPlaying]);

  useEffect(() => {
    if (currentItem === null || session === null || currentTargetSeconds <= 0) {
      return;
    }

    if (elapsedSeconds < currentTargetSeconds) {
      return;
    }

    setIsPlaying(false);
    const run = async () => {
      await finalizeItem(currentItem, currentTargetSeconds);
      if (session.option.auto.isSkip && currentIndex < queue.length - 1) {
        setCurrentIndex(index => index + 1);
        setIsPlaying(true);
      }
    };

    void run();
  }, [
    currentIndex,
    currentItem,
    currentTargetSeconds,
    elapsedSeconds,
    finalizeItem,
    queue.length,
    session,
  ]);

  useEffect(() => {
    if (!queue.length) {
      return;
    }

    void (async () => {
      const width = Number(session === null ? '0' : (session.option.window.width ?? '0'));
      const height = Number(session === null ? '0' : (session.option.window.height ?? '0'));
      if (!Number.isFinite(width) || width <= 0) {
        return;
      }

      const nextHeight =
        Number.isFinite(height) && height > 0
          ? height
          : Math.max(
              width,
              Math.round(
                (currentItem === null ? width : currentItem.baseHeight) *
                  (width / (currentItem === null ? width : currentItem.baseWidth || width)),
              ),
            );

      await getCurrentWindow().setSize(new LogicalSize(width, nextHeight));
    })();
  }, [
    currentItem === null ? null : currentItem.baseHeight,
    currentItem === null ? null : currentItem.baseWidth,
    queue.length,
    session === null ? null : session.option.window.height,
    session === null ? null : session.option.window.width,
  ]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    void (async () => {
      try {
        unlisten = await listen<{ recordId: string }>('capture://completed', event => {
          if (currentItem !== null && event.payload.recordId === currentItem.recordId) {
            setStatus('Capture saved to the current record.');
          }
        });
      } catch (error) {
        console.warn('Failed to register capture completion listener', error);
      }
    })();

    return () => {
      unlisten?.();
    };
  }, [currentItem === null ? null : currentItem.recordId]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }

      void finalizeItem(currentItemRef.current, elapsedSecondsRef.current, timestampNow());
    };
  }, [finalizeItem]);

  const moveToIndex = useCallback(
    async (nextIndex: number) => {
      if (currentItem === null) {
        return;
      }

      await finalizeItem(currentItem, elapsedSeconds);
      setCurrentIndex(nextIndex);
      setIsPlaying(true);
      setStatus(null);
    },
    [currentItem, elapsedSeconds, finalizeItem],
  );

  const handleCapture = useCallback(async () => {
    if (currentItem === null || session === null) {
      return;
    }

    await ipc.capture.openOverlay({
      sessionId: session.sessionId,
      recordId: currentItem.recordId,
      assetId: currentItem.assetId,
      targetSeconds: currentTargetSeconds || null,
      actualSeconds: elapsedSeconds,
    });
  }, [currentItem, currentTargetSeconds, elapsedSeconds, session]);

  return {
    currentImageSrc,
    currentIndex,
    currentItem,
    currentTargetSeconds,
    elapsedSeconds,
    formatSeconds,
    handleCapture,
    hasNext: currentIndex < queue.length - 1,
    hasPrevious: currentIndex > 0,
    isPlaying,
    moveToIndex,
    queue,
    session,
    setIsPlaying,
    status,
  };
}

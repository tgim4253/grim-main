import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LogicalSize, getCurrentWindow } from '@tauri-apps/api/window';
import { ipc } from '../../../shared/lib/ipc';
import type {
  CroquisRecordDetail,
  CroquisSession,
  CroquisSessionItem,
} from '../../../shared/types';
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
  const finishPromisesRef = useRef<Map<string, Promise<CroquisRecordDetail>>>(new Map());
  const currentItemRef = useRef<CroquisSessionItem | null>(null);
  const currentRecordIdRef = useRef<string | null>(null);

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
      finishPromisesRef.current.clear();
      currentRecordIdRef.current = null;
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
  const isRecordSaveEnabled = session?.option.isRecordSave ?? true;

  useEffect(() => {
    currentItemRef.current = currentItem;
    currentRecordIdRef.current = currentItem?.recordId ?? null;
  }, [currentItem]);

  const finishItem = useCallback(
    async (
      item: CroquisSessionItem | null,
      durationSeconds: number,
      finishedAt = timestampNow(),
    ) => {
      if (item === null) {
        return null;
      }

      if (item.recordId) {
        return item.recordId;
      }

      const existingPromise = finishPromisesRef.current.get(item.itemId);
      if (existingPromise) {
        const existingRecord = await existingPromise;
        return existingRecord.id;
      }

      const finishPromise = ipc.record.finish({
        sourceAssetId: item.assetId,
        title: item.title,
        targetDurationSeconds: item.targetDurationSeconds ?? null,
        actualDurationSeconds: Math.max(0, durationSeconds),
        finishedAt,
        tagIds: item.tagIds,
      });

      finishPromisesRef.current.set(item.itemId, finishPromise);

      try {
        const record = await finishPromise;
        setQueue(items =>
          items.map(queueItem =>
            queueItem.itemId === item.itemId ? { ...queueItem, recordId: record.id } : queueItem,
          ),
        );

        if (currentItemRef.current?.itemId === item.itemId) {
          currentItemRef.current = { ...currentItemRef.current, recordId: record.id };
          currentRecordIdRef.current = record.id;
        }

        return record.id;
      } catch (error) {
        finishPromisesRef.current.delete(item.itemId);
        throw error;
      }
    },
    [],
  );

  useEffect(() => {
    if (currentItem === null) {
      return;
    }

    recordStartRef.current = Date.now();
    setElapsedSeconds(0);
  }, [currentItem?.itemId]);

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
    if (!isPlaying || currentItem === null || session === null || currentTargetSeconds <= 0) {
      return;
    }

    if (elapsedSeconds < currentTargetSeconds) {
      return;
    }

    setIsPlaying(false);
    const run = async () => {
      try {
        const shouldSaveRequiredResult = session.option.isRecordSave && currentItem.resultRequired;
        if (shouldSaveRequiredResult) {
          setStatus('Saving completed record...');
          await finishItem(currentItem, currentTargetSeconds);
        }

        if (session.option.auto.isSkip && currentIndex < queue.length - 1) {
          setCurrentIndex(index => index + 1);
          setIsPlaying(true);
          setStatus(null);
          return;
        }

        setStatus(shouldSaveRequiredResult ? 'Record saved.' : 'Step complete.');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Failed to save record.');
      }
    };

    void run();
  }, [
    currentIndex,
    currentItem,
    currentTargetSeconds,
    elapsedSeconds,
    finishItem,
    isPlaying,
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
          if (event.payload.recordId === currentRecordIdRef.current) {
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
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  const moveToIndex = useCallback(
    (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= queue.length) {
        return;
      }

      setCurrentIndex(nextIndex);
      setIsPlaying(true);
      setStatus(null);
    },
    [queue.length],
  );

  const handleSave = useCallback(async () => {
    if (currentItem === null) {
      return;
    }

    if (!isRecordSaveEnabled) {
      setStatus('Record saving is disabled for this session.');
      return;
    }

    if (currentItem.recordId) {
      setStatus('Record already saved.');
      return;
    }

    setStatus('Saving record...');
    try {
      await finishItem(currentItem, elapsedSeconds);
      setStatus('Record saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save record.');
    }
  }, [currentItem, elapsedSeconds, finishItem, isRecordSaveEnabled]);

  const handleCapture = useCallback(async () => {
    if (currentItem === null || session === null) {
      return;
    }

    if (!session.option.isRecordSave) {
      setStatus('Record saving is disabled for this session.');
      return;
    }

    if (!session.option.isCapture) {
      setStatus('Capture is disabled for this session.');
      return;
    }

    setIsPlaying(false);
    setStatus('Saving record for capture...');
    try {
      const recordId = await finishItem(currentItem, elapsedSeconds);
      if (!recordId) {
        setStatus('Failed to save record for capture.');
        return;
      }

      await ipc.capture.openOverlay({
        sessionId: session.sessionId,
        recordId,
        targetSeconds: currentTargetSeconds || null,
        actualSeconds: elapsedSeconds,
      });
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to open capture.');
    }
  }, [currentItem, currentTargetSeconds, elapsedSeconds, finishItem, session]);

  return {
    currentImageSrc,
    currentIndex,
    currentItem,
    currentTargetSeconds,
    elapsedSeconds,
    formatSeconds,
    handleCapture,
    handleSave,
    hasNext: currentIndex < queue.length - 1,
    hasPrevious: currentIndex > 0,
    isCurrentSaved: Boolean(currentItem?.recordId),
    isRecordSaveEnabled,
    isPlaying,
    moveToIndex,
    queue,
    session,
    setIsPlaying,
    status,
  };
}

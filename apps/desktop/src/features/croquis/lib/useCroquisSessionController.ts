import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LogicalSize, getCurrentWindow } from '@tauri-apps/api/window';
import { useTranslation } from 'react-i18next';
import { ipc } from '../../../shared/lib/ipc';
import type {
  CroquisRecordDetail,
  CroquisSession,
  CroquisSessionItem,
} from '../../../shared/types';
import { formatSeconds, shuffleItems, timestampNow } from './sessionUtils';

const sessionLoadCache = new Map<string, Promise<CroquisSession | null>>();
const STATUS_AUTO_DISMISS_MS = 2200;

type UseCroquisSessionControllerParams = {
  sessionId: string | null;
};

export function useCroquisSessionController({ sessionId }: UseCroquisSessionControllerParams) {
  const { t } = useTranslation('common');
  const [session, setSession] = useState<CroquisSession | null>(null);
  const [queue, setQueue] = useState<CroquisSessionItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const autoDismissStatusMessages = useMemo(
    () =>
      new Set([
        t('croquis.status.capture_saved', {
          defaultValue: 'Capture saved to the current record.',
        }),
        t('croquis.status.record_saved', { defaultValue: 'Record saved.' }),
        t('croquis.status.step_complete', { defaultValue: 'Step complete.' }),
      ]),
    [t],
  );

  const intervalRef = useRef<number | null>(null);
  const elapsedSecondsRef = useRef(0);
  const recordStartRef = useRef<number>(Date.now());
  const finishPromisesRef = useRef<Map<string, Promise<CroquisRecordDetail>>>(new Map());
  const currentItemRef = useRef<CroquisSessionItem | null>(null);
  const currentRecordIdRef = useRef<string | null>(null);
  const appliedWindowSizeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus(
        t('croquis.error.missing_session_id', { defaultValue: 'Missing session identifier.' }),
      );
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
        setStatus(
          t('croquis.error.payload_unavailable', {
            defaultValue: 'Croquis session payload is no longer available.',
          }),
        );
        return;
      }

      const ordered = payload.isShuffle ? shuffleItems(payload.items) : payload.items;
      finishPromisesRef.current.clear();
      currentRecordIdRef.current = null;
      appliedWindowSizeKeyRef.current = null;
      elapsedSecondsRef.current = 0;
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
  }, [sessionId, t]);

  const currentItem = currentIndex < queue.length ? queue[currentIndex] : null;
  const currentImageSrc = useMemo(
    () => (currentItem === null ? null : convertFileSrc(currentItem.sourcePath)),
    [currentItem],
  );
  const currentTargetSeconds = currentItem?.targetDurationSeconds ?? 0;
  const isRecordSaveEnabled = currentItem?.recordSaveEnabled ?? true;
  const isCaptureEnabled = currentItem?.captureEnabled ?? false;

  useEffect(() => {
    if (status === null || !autoDismissStatusMessages.has(status)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStatus(currentStatus => (currentStatus === status ? null : currentStatus));
    }, STATUS_AUTO_DISMISS_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoDismissStatusMessages, status]);

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
    elapsedSecondsRef.current = 0;
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

    recordStartRef.current = Date.now() - elapsedSecondsRef.current * 1000;
    intervalRef.current = window.setInterval(() => {
      const nextSeconds = (Date.now() - recordStartRef.current) / 1000;
      elapsedSecondsRef.current = nextSeconds;
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
        const shouldSaveRequiredResult =
          currentItem.recordSaveEnabled && currentItem.resultRequired;
        if (shouldSaveRequiredResult) {
          setStatus(
            t('croquis.status.saving_completed_record', {
              defaultValue: 'Saving completed record...',
            }),
          );
          await finishItem(currentItem, currentTargetSeconds);
        }

        if (currentItem.autoAdvance && currentIndex < queue.length - 1) {
          setCurrentIndex(index => index + 1);
          setIsPlaying(true);
          setStatus(null);
          return;
        }

        setStatus(
          shouldSaveRequiredResult
            ? t('croquis.status.record_saved', { defaultValue: 'Record saved.' })
            : t('croquis.status.step_complete', { defaultValue: 'Step complete.' }),
        );
      } catch (error) {
        setStatus(
          error instanceof Error
            ? error.message
            : t('croquis.error.save_record', { defaultValue: 'Failed to save record.' }),
        );
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
    t,
  ]);

  useEffect(() => {
    if (!queue.length) {
      return;
    }

    void (async () => {
      if (session === null) {
        return;
      }

      const width = Number(session.windowWidth ?? '0');
      const height = Number(session.windowHeight ?? '0');
      if (!Number.isFinite(width) || width <= 0) {
        return;
      }

      const windowSizeKey = [
        session.sessionId,
        session.windowWidth ?? '',
        session.windowHeight ?? '',
        queue
          .map(item => `${item.itemId}:${String(item.baseWidth)}x${String(item.baseHeight)}`)
          .join('|'),
      ].join(':');

      if (appliedWindowSizeKeyRef.current === windowSizeKey) {
        return;
      }

      appliedWindowSizeKeyRef.current = windowSizeKey;

      const validItems = queue.filter(item => item.baseWidth > 0 && item.baseHeight > 0);
      const averageScaledHeight =
        validItems.length > 0
          ? validItems.reduce((sum, item) => sum + item.baseHeight * (width / item.baseWidth), 0) /
            validItems.length
          : width;
      const nextHeight =
        Number.isFinite(height) && height > 0
          ? height
          : Math.max(width, Math.ceil(averageScaledHeight));

      await getCurrentWindow().setSize(new LogicalSize(width, nextHeight));
    })();
  }, [queue, session]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    void (async () => {
      try {
        unlisten = await listen<{ recordId: string }>('capture://completed', event => {
          if (event.payload.recordId === currentRecordIdRef.current) {
            setStatus(
              t('croquis.status.capture_saved', {
                defaultValue: 'Capture saved to the current record.',
              }),
            );
          }
        });
      } catch (error) {
        console.warn('Failed to register capture completion listener', error);
      }
    })();

    return () => {
      unlisten?.();
    };
  }, [t]);

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
      setStatus(
        t('croquis.status.record_saving_disabled', {
          defaultValue: 'Record saving is disabled for this session.',
        }),
      );
      return;
    }

    if (currentItem.recordId) {
      setStatus(
        t('croquis.status.record_already_saved', { defaultValue: 'Record already saved.' }),
      );
      return;
    }

    setStatus(t('croquis.status.saving_record', { defaultValue: 'Saving record...' }));
    try {
      await finishItem(currentItem, elapsedSeconds);
      setStatus(t('croquis.status.record_saved', { defaultValue: 'Record saved.' }));
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : t('croquis.error.save_record', { defaultValue: 'Failed to save record.' }),
      );
    }
  }, [currentItem, elapsedSeconds, finishItem, isRecordSaveEnabled, t]);

  const handleCapture = useCallback(async () => {
    if (currentItem === null || session === null) {
      return;
    }

    if (!currentItem.recordSaveEnabled) {
      setStatus(
        t('croquis.status.record_saving_disabled', {
          defaultValue: 'Record saving is disabled for this session.',
        }),
      );
      return;
    }

    if (!currentItem.captureEnabled) {
      setStatus(
        t('croquis.status.capture_disabled', {
          defaultValue: 'Capture is disabled for this session.',
        }),
      );
      return;
    }

    setIsPlaying(false);
    setStatus(
      t('croquis.status.saving_record_for_capture', {
        defaultValue: 'Saving record for capture...',
      }),
    );
    try {
      const recordId = await finishItem(currentItem, elapsedSeconds);
      if (!recordId) {
        setStatus(
          t('croquis.error.save_record_for_capture', {
            defaultValue: 'Failed to save record for capture.',
          }),
        );
        return;
      }

      await ipc.capture.openOverlay({
        sessionId: session.sessionId,
        recordId,
        targetSeconds: currentTargetSeconds || null,
        actualSeconds: elapsedSeconds,
        resultSavePath: currentItem.resultSavePath ?? null,
      });
      setStatus(null);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : t('croquis.error.open_capture', { defaultValue: 'Failed to open capture.' }),
      );
    }
  }, [currentItem, currentTargetSeconds, elapsedSeconds, finishItem, session, t]);

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
    isCaptureEnabled,
    isRecordSaveEnabled,
    isPlaying,
    moveToIndex,
    queue,
    session,
    setIsPlaying,
    status,
  };
}

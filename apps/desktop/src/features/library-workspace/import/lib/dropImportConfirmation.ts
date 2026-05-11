import { useCallback, useRef, useState } from 'react';
import {
  DROP_IMAGE_WARNING_THRESHOLD,
  countDroppedImageFileCandidates,
  type DroppedFileDataSource,
} from '../dropFileData';

export type DropImportWarningState = {
  countIsExact: boolean;
  itemCount?: number;
};

export type DropImportWarningRequest = {
  localSource?: DroppedFileDataSource | null;
  remoteItemCount?: number;
  threshold?: number;
};

export async function getDropImportWarning({
  localSource = null,
  remoteItemCount = 0,
  threshold = DROP_IMAGE_WARNING_THRESHOLD,
}: DropImportWarningRequest): Promise<DropImportWarningState | null> {
  if (remoteItemCount > threshold) {
    return {
      countIsExact: localSource === null,
      itemCount: localSource === null ? remoteItemCount : undefined,
    };
  }

  const localCandidateLimit = Math.max(1, threshold + 1 - remoteItemCount);
  const localCandidateCount = localSource
    ? await countDroppedImageFileCandidates(localSource, localCandidateLimit)
    : { count: 0, exact: true };
  const itemCount = remoteItemCount + localCandidateCount.count;

  if (itemCount <= threshold) {
    return null;
  }

  return {
    countIsExact: localCandidateCount.exact,
    itemCount: localCandidateCount.exact ? itemCount : undefined,
  };
}

export function useDropImportConfirmation<TPending>() {
  const [warning, setWarning] = useState<DropImportWarningState | null>(null);
  const pendingRef = useRef<TPending | null>(null);

  const requestConfirmation = useCallback(
    (pending: TPending, nextWarning: DropImportWarningState) => {
      pendingRef.current = pending;
      setWarning(nextWarning);
    },
    [],
  );

  const clearConfirmation = useCallback(() => {
    pendingRef.current = null;
    setWarning(null);
  }, []);

  const takePendingConfirmation = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setWarning(null);
    return pending;
  }, []);

  const hasPendingConfirmation = useCallback(() => pendingRef.current !== null, []);

  return {
    warning,
    requestConfirmation,
    clearConfirmation,
    takePendingConfirmation,
    hasPendingConfirmation,
  };
}

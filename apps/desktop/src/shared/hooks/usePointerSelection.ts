import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export type PointerSelectionMode = 'freeform' | 'square';

export type PointerSelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PointerPoint = {
  x: number;
  y: number;
};

export interface UsePointerSelectionOptions<T extends Element = Element> {
  mode: PointerSelectionMode;
  minSize?: number;
  disabled?: boolean;
  onSelectionStart?: (event: ReactPointerEvent<T>) => void;
  onSelectionChange?: (selection: PointerSelectionRect | null, event: ReactPointerEvent<T>) => void;
  onSelectionCancel?: (event: ReactPointerEvent<T>) => void;
  onSelectionInvalid?: (event: ReactPointerEvent<T>) => void;
}

export interface UsePointerSelectionResult<T extends Element = Element> {
  selection: PointerSelectionRect | null;
  completedSelection: PointerSelectionRect | null;
  isSelecting: boolean;
  resetSelection: () => void;
  clearCompletedSelection: () => void;
  handlePointerDown: (event: ReactPointerEvent<T>) => void;
  handlePointerMove: (event: ReactPointerEvent<T>) => void;
  handlePointerUp: (event: ReactPointerEvent<T>) => void;
  handlePointerCancel: (event: ReactPointerEvent<T>) => void;
}

const createSquareRect = (start: PointerPoint, current: PointerPoint): PointerSelectionRect => {
  const deltaX = current.x - start.x;
  const deltaY = current.y - start.y;
  const size = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  const dirX = deltaX < 0 ? -1 : 1;
  const dirY = deltaY < 0 ? -1 : 1;
  const endX = start.x + size * dirX;
  const endY = start.y + size * dirY;
  const x = Math.min(start.x, endX);
  const y = Math.min(start.y, endY);

  return {
    x,
    y,
    width: Math.abs(endX - start.x),
    height: Math.abs(endY - start.y),
  };
};

const createFreeformRect = (start: PointerPoint, current: PointerPoint): PointerSelectionRect => ({
  x: Math.min(start.x, current.x),
  y: Math.min(start.y, current.y),
  width: Math.abs(current.x - start.x),
  height: Math.abs(current.y - start.y),
});

export const usePointerSelection = <T extends Element = Element>(
  options: UsePointerSelectionOptions<T>,
): UsePointerSelectionResult<T> => {
  const {
    mode,
    minSize = 1,
    disabled = false,
    onSelectionStart,
    onSelectionChange,
    onSelectionCancel,
    onSelectionInvalid,
  } = options;

  const startRef = useRef<PointerPoint | null>(null);
  const selectionRef = useRef<PointerSelectionRect | null>(null);
  const isPointerDownRef = useRef(false);

  const selectionChangeRef = useRef(onSelectionChange);
  const selectionStartRef = useRef(onSelectionStart);
  const selectionCancelRef = useRef(onSelectionCancel);
  const selectionInvalidRef = useRef(onSelectionInvalid);

  useEffect(() => {
    selectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    selectionStartRef.current = onSelectionStart;
  }, [onSelectionStart]);

  useEffect(() => {
    selectionCancelRef.current = onSelectionCancel;
  }, [onSelectionCancel]);

  useEffect(() => {
    selectionInvalidRef.current = onSelectionInvalid;
  }, [onSelectionInvalid]);

  const [selection, setSelection] = useState<PointerSelectionRect | null>(null);
  const [completedSelection, setCompletedSelection] = useState<PointerSelectionRect | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  const updateSelection = useCallback(
    (rect: PointerSelectionRect | null, event?: ReactPointerEvent<T>) => {
      setSelection(rect);
      selectionRef.current = rect;
      if (event && selectionChangeRef.current) {
        selectionChangeRef.current(rect, event);
      }
    },
    [],
  );

  const resetSelection = useCallback(() => {
    updateSelection(null);
  }, [updateSelection]);

  const clearCompletedSelection = useCallback(() => {
    setCompletedSelection(null);
  }, []);

  useEffect(() => {
    if (!disabled) {
      return;
    }

    isPointerDownRef.current = false;
    startRef.current = null;
    setIsSelecting(false);
    resetSelection();
    setCompletedSelection(null);
  }, [disabled, resetSelection]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (disabled) {
        return;
      }

      event.preventDefault();

      const point = { x: event.clientX, y: event.clientY };
      startRef.current = point;
      isPointerDownRef.current = true;
      setIsSelecting(true);
      updateSelection({ x: point.x, y: point.y, width: 0, height: 0 }, event);

      if (selectionStartRef.current) {
        selectionStartRef.current(event);
      }
    },
    [disabled, updateSelection],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (!isPointerDownRef.current || !startRef.current || disabled) {
        return;
      }

      event.preventDefault();

      const current = { x: event.clientX, y: event.clientY };
      const rect =
        mode === 'square'
          ? createSquareRect(startRef.current, current)
          : createFreeformRect(startRef.current, current);

      updateSelection(rect, event);
    },
    [disabled, mode, updateSelection],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (!isPointerDownRef.current) {
        return;
      }

      event.preventDefault();

      isPointerDownRef.current = false;
      startRef.current = null;
      setIsSelecting(false);

      const currentSelection = selectionRef.current;
      if (!currentSelection) {
        resetSelection();
        if (selectionCancelRef.current) {
          selectionCancelRef.current(event);
        }
        return;
      }

      if (currentSelection.width < minSize || currentSelection.height < minSize) {
        resetSelection();
        if (selectionInvalidRef.current) {
          selectionInvalidRef.current(event);
        }
        return;
      }

      setCompletedSelection(currentSelection);
    },
    [minSize, resetSelection],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<T>) => {
      if (!isPointerDownRef.current) {
        return;
      }

      event.preventDefault();

      isPointerDownRef.current = false;
      startRef.current = null;
      setIsSelecting(false);
      resetSelection();
      if (selectionCancelRef.current) {
        selectionCancelRef.current(event);
      }
    },
    [resetSelection],
  );

  return {
    selection,
    completedSelection,
    isSelecting,
    resetSelection,
    clearCompletedSelection,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
};

export default usePointerSelection;

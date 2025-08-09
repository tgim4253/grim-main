import { useCallback, useEffect, useRef, useState } from "react";
import { parseDropTarget } from "../utils/dndIds";

// Hover-to-open: call targetOpen(id) after delay when dragging over a folder/container
type HoverOpenOptions = {
  delay?: number;
  disabled?: boolean;
  isValidTarget?: (id: string) => boolean;
};

export function useHoverOpen(
  targetOpen: (id: string) => void,
  { delay = 700, disabled = false, isValidTarget }: HoverOpenOptions = {}
) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  // Use number for browser environments to avoid NodeJS.Timeout typing issues
  const timerRef = useRef<number | null>(null);
  const lastIdRef = useRef<string | null>(null);

  // Clear any pending timer
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Ensure timers are cleared on unmount
  useEffect(() => clearTimer, [clearTimer]);

  // Main handler: call during drag-over events
  const onDragOverHoverOpen = useCallback(
    (overId: unknown, activeIds: string[]) => {
      if (disabled) return;

      const target = parseDropTarget(overId);
      const id = target?.id ?? null;

      // Update state only if it actually changes to reduce re-renders
      setHoverId((prev) => (prev === id ? prev : id));

      // ignore self or null target
      if (!id || activeIds.includes(id)) {
        clearTimer();
        lastIdRef.current = null;
        return;
      }

      // external predicate decides if the target can be opened
      if (isValidTarget && !isValidTarget(id)) {
        clearTimer();
        lastIdRef.current = null;
        return;
      }

      // Start a new timer only when hovering a new id
      if (lastIdRef.current !== id) {
        clearTimer();
        lastIdRef.current = id;
        timerRef.current = window.setTimeout(() => {
          if (lastIdRef.current === id) {
            targetOpen(id);
          }
        }, delay);
      }
    },
    [clearTimer, delay, disabled, isValidTarget, targetOpen]
  );

  // Public reset: call on drop/cancel/end of drag
  const resetHoverOpen = useCallback(() => {
    setHoverId(null);
    lastIdRef.current = null;
    clearTimer();
  }, [clearTimer]);

  return { hoverId, onDragOverHoverOpen, resetHoverOpen } as const;
}
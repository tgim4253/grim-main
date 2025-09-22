import { useCallback, useMemo, useEffect, useState } from 'react';

type UseMultiSelectOptions = {
  // Merge range into existing selection when Shift+Ctrl/Cmd
  mergeShiftToggle?: boolean;
  // Drop selections/anchor that are no longer visible
  pruneOnVisibilityChange?: boolean;
  // Keep selected items when just click
  keepSelectedOnClick?: boolean;
};

export function useMultiSelect(visibleIds: string[], options: UseMultiSelectOptions = {}) {
  const { mergeShiftToggle = false, pruneOnVisibilityChange = false, keepSelectedOnClick = false } = options;

  // Selected IDs as a Set
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Starting point (anchor) for Shift+click range selection.
  const [anchorId, setAnchorId] = useState<string | null>(null);

  // id -> index map
  const indexOfId = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < visibleIds.length; i++) map.set(visibleIds[i], i);
    return map;
  }, [visibleIds]);

  // remove not visiable anchor/selection when visibility changes
  useEffect(() => {
    if (!pruneOnVisibilityChange) return;

    setSelected(prev => {
      const next = new Set<string>();
      prev.forEach(id => {
        // Keep only visible items(indexOfId has only visible items)
        if (indexOfId.has(id)) next.add(id);
      });

      // checking only size is ok
      return next.size === prev.size ? prev : next;
    });

    setAnchorId(prev => (prev && indexOfId.has(prev) ? prev : null));
  }, [indexOfId, pruneOnVisibilityChange]);

  /* helpers */

  // Replace selection with only this id
  const selectOnly = useCallback((id: string) => {
    setSelected(prev => (prev.size === 1 && prev.has(id) ? prev : new Set([id])));
  }, []);

  // Toggle a single id
  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Select range from anchor to `toId`
  const selectRange = useCallback(
    (toId: string, merge = false) => {
      if (!anchorId) return;

      const a = indexOfId.get(anchorId);
      const b = indexOfId.get(toId);
      if (a == null || b == null) return;

      const [start, end] = a < b ? [a, b] : [b, a];
      const range = visibleIds.slice(start, end + 1);

      setSelected(prev => {
        if (merge) {
          // Merge with existing selection
          const next = new Set(prev);
          for (const id of range) next.add(id);
          return next;
        }
        // Replace with the range
        return new Set(range);
      });
    },
    [anchorId, indexOfId, visibleIds],
  );

  const clearSelection = useCallback(() => {
    setSelected(prev => (prev.size ? new Set() : prev));
    setAnchorId(null);
  }, []);

  /* Events */

  const onItemClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();

      const isRange = e.shiftKey && !!anchorId;
      const isToggle = e.metaKey || e.ctrlKey;

      if (isRange) {
        // Shift + (optional) Ctrl/Cmd to merge
        selectRange(id, mergeShiftToggle && isToggle);
      } else if (isToggle) {
        toggle(id);
      } else {
        if(!keepSelectedOnClick){ 
          // remove all selected item
          selectOnly(id);
        } else {
          toggle(id);
        }
      }

      // Update anchor unless range-extending
      if (!e.shiftKey) setAnchorId(id);
    },
    [anchorId, mergeShiftToggle, selectOnly, selectRange, toggle],
  );

  // Ensure drag-start from a non-selected item selects it first
  const onDragStartSelect = useCallback((id: string) => {
    setSelected(prev => (prev.has(id) ? prev : new Set([id])));
  }, []);

  // Convenience getter
  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return {
    selected,
    setSelected, // expose for advanced usages
    anchorId,
    setAnchorId, // expose for advanced usages
    isSelected,
    onItemClick,
    onDragStartSelect,
    clearSelection,
    selectOnly, // optional direct helpers
    toggle,
    selectRange,
  } as const;
}

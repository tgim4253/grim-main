import { useCallback, useEffect, useState } from 'react';

type UseSelectionModalStateParams<TItem extends { id: string }> = {
  open: boolean;
  items: TItem[];
  initialSelectedIds: string[];
  loadResults: (query: string, items: TItem[]) => Promise<TItem[]> | TItem[];
  onConfirm: (selectedIds: string[]) => Promise<void>;
  onClose: () => void;
  saveErrorMessage: string;
};

export function useSelectionModalState<TItem extends { id: string }>({
  open,
  items,
  initialSelectedIds,
  loadResults,
  onConfirm,
  onClose,
  saveErrorMessage,
}: UseSelectionModalStateParams<TItem>) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedIds);
  const [results, setResults] = useState<TItem[]>(items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery('');
    setSelectedIds(initialSelectedIds);
    setResults(items);
    setError(null);
  }, [initialSelectedIds, items, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const syncResults = async () => {
      try {
        const nextResults = await loadResults(query, items);
        if (!cancelled) {
          setResults(nextResults);
        }
      } catch {
        if (!cancelled) {
          setResults(items);
        }
      }
    };

    void syncResults();
    return () => {
      cancelled = true;
    };
  }, [items, loadResults, open, query]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(current =>
      current.includes(id) ? current.filter(currentId => currentId !== id) : [...current, id],
    );
  }, []);

  const handleConfirm = useCallback(() => {
    if (busy) {
      return;
    }

    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await onConfirm(selectedIds);
        onClose();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : saveErrorMessage);
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, onClose, onConfirm, saveErrorMessage, selectedIds]);

  return {
    busy,
    error,
    handleConfirm,
    query,
    results,
    selectedIds,
    setQuery,
    toggleSelection,
  };
}

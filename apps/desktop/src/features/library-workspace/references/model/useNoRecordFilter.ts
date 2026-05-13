import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '@/shared/lib/error';
import { ipc } from '@/shared/lib/ipc';
import type { AssetDetail, AssetListSource, AssetSummary } from '@/shared/types';
import { createAssetRecordCountMap, mergeCachedAssetRecordCounts } from './assetCache';

type UseNoRecordFilterOptions = {
  assets: readonly AssetSummary[];
  source: AssetListSource;
};

export function useNoRecordFilter({ assets, source }: UseNoRecordFilterOptions) {
  const [selected, setSelected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [assetRecordCountsById, setAssetRecordCountsById] = useState(
    () => new Map<string, number>(),
  );
  const loadSequenceRef = useRef(0);

  useEffect(() => {
    const assetIds = new Set(assets.map(asset => asset.id));
    setAssetRecordCountsById(current => {
      let changed = false;
      const nextRecordCountsById = new Map<string, number>();

      for (const [assetId, recordCount] of current.entries()) {
        if (assetIds.has(assetId)) {
          nextRecordCountsById.set(assetId, recordCount);
        } else {
          changed = true;
        }
      }

      return changed || nextRecordCountsById.size !== current.size ? nextRecordCountsById : current;
    });
  }, [assets]);

  useEffect(() => {
    if (!selected) {
      loadSequenceRef.current += 1;
      setLoading(false);
      setError(null);
      return;
    }

    if (assets.length === 0) {
      setAssetRecordCountsById(new Map());
      setLoading(false);
      setError(null);
      return;
    }

    const loadSequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = loadSequence;
    setLoading(true);
    setError(null);

    void ipc.asset
      .listRecordCounts(source)
      .then(recordCounts => {
        if (loadSequenceRef.current !== loadSequence) {
          return;
        }

        setAssetRecordCountsById(createAssetRecordCountMap(assets, recordCounts));
      })
      .catch((nextError: unknown) => {
        if (loadSequenceRef.current !== loadSequence) {
          return;
        }

        setAssetRecordCountsById(new Map());
        setError(getErrorMessage(nextError, 'Failed to load reference filter data.'));
      })
      .finally(() => {
        if (loadSequenceRef.current === loadSequence) {
          setLoading(false);
        }
      });
  }, [assets, refreshKey, selected, source]);

  const changeSelected = useCallback((nextSelected: boolean) => {
    setSelected(nextSelected);
    if (!nextSelected) {
      setError(null);
      return;
    }

    setLoading(true);
    setRefreshKey(current => current + 1);
  }, []);

  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    setRefreshKey(current => current + 1);
  }, []);

  const updateRecordCount = useCallback((assetId: string, recordCount: number) => {
    setAssetRecordCountsById(current => {
      if (!current.has(assetId)) {
        return current;
      }

      return new Map(current).set(assetId, recordCount);
    });
  }, []);

  const mergeRecordCounts = useCallback((updatedDetails: readonly AssetDetail[]) => {
    setAssetRecordCountsById(current => mergeCachedAssetRecordCounts(current, updatedDetails));
  }, []);

  return {
    assetRecordCountsById,
    selected,
    loading,
    error,
    changeSelected,
    retry,
    updateRecordCount,
    mergeRecordCounts,
  };
}

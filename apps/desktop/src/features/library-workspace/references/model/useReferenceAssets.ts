import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '@/shared/lib/error';
import { ipc } from '@/shared/lib/ipc';
import type { AssetListSource, AssetSummary } from '@/shared/types';

export type UseReferenceAssetsOptions = {
  source: AssetListSource;
  refreshKey?: number;
};

export function useReferenceAssets({ source, refreshKey = 0 }: UseReferenceAssetsOptions) {
  const { t } = useTranslation('common');
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadSequenceRef = useRef(0);

  const loadAssets = useCallback(async () => {
    const loadSequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = loadSequence;
    setIsLoading(true);
    setError(null);

    try {
      const nextAssets = await ipc.asset.list(source);
      if (loadSequenceRef.current !== loadSequence) {
        return;
      }

      setAssets(nextAssets);
    } catch (nextError) {
      if (loadSequenceRef.current !== loadSequence) {
        return;
      }

      setAssets([]);
      setError(
        getErrorMessage(
          nextError,
          t('references.error.load_assets', { defaultValue: 'Failed to load assets.' }),
        ),
      );
    } finally {
      if (loadSequenceRef.current === loadSequence) {
        setIsLoading(false);
      }
    }
  }, [source, t]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets, refreshKey]);

  return {
    assets,
    isLoading,
    error,
    loadAssets,
  };
}

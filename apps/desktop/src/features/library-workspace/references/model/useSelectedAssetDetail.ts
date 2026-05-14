import { useCallback, useEffect, useRef, useState } from 'react';
import { ipc } from '@/shared/lib/ipc';
import type { AssetDetail, AssetSummary, CroquisRecordDetail } from '@/shared/types';
import { createRelatedRecordDetailMap, mergeCachedAssetDetails } from './assetCache';

type UseSelectedAssetDetailOptions = {
  assets: readonly AssetSummary[];
  selectedAssetId: string | null;
  onPreviewClose: () => void;
  onRecordCountChange: (assetId: string, recordCount: number) => void;
};

export function useSelectedAssetDetail({
  assets,
  selectedAssetId,
  onPreviewClose,
  onRecordCountChange,
}: UseSelectedAssetDetailOptions) {
  const [selectedAssetDetail, setSelectedAssetDetail] = useState<AssetDetail | null>(null);
  const [assetDetailsById, setAssetDetailsById] = useState(() => new Map<string, AssetDetail>());
  const [relatedRecordDetailsById, setRelatedRecordDetailsById] = useState(
    () => new Map<string, CroquisRecordDetail>(),
  );
  const selectedAssetDetailLoadSequenceRef = useRef(0);

  useEffect(() => {
    const assetIds = new Set(assets.map(asset => asset.id));
    setAssetDetailsById(current => {
      let changed = false;
      const nextDetailsById = new Map<string, AssetDetail>();

      for (const [assetId, detail] of current.entries()) {
        if (assetIds.has(assetId)) {
          nextDetailsById.set(assetId, detail);
        } else {
          changed = true;
        }
      }

      return changed || nextDetailsById.size !== current.size ? nextDetailsById : current;
    });
  }, [assets]);

  useEffect(() => {
    const detailLoadSequence = selectedAssetDetailLoadSequenceRef.current + 1;
    selectedAssetDetailLoadSequenceRef.current = detailLoadSequence;
    const isCurrentDetailLoad = () =>
      selectedAssetDetailLoadSequenceRef.current === detailLoadSequence;

    if (!selectedAssetId) {
      setSelectedAssetDetail(null);
      setRelatedRecordDetailsById(new Map());
      onPreviewClose();
      return;
    }

    const loadDetail = async () => {
      try {
        const detail = await ipc.asset.getDetail(selectedAssetId);
        if (!isCurrentDetailLoad()) {
          return;
        }

        setSelectedAssetDetail(detail);
        setAssetDetailsById(current => new Map(current).set(detail.id, detail));
        onRecordCountChange(detail.id, detail.relatedRecords.length);
        setRelatedRecordDetailsById(new Map());

        const detailResults = await Promise.allSettled(
          detail.relatedRecords.map(record => ipc.record.getDetail(record.id)),
        );

        if (!isCurrentDetailLoad()) {
          return;
        }

        setRelatedRecordDetailsById(
          createRelatedRecordDetailMap(detail.relatedRecords, detailResults),
        );
      } catch {
        if (isCurrentDetailLoad()) {
          setSelectedAssetDetail(null);
          setRelatedRecordDetailsById(new Map());
        }
      }
    };

    void loadDetail();

    return () => {
      selectedAssetDetailLoadSequenceRef.current += 1;
    };
  }, [onPreviewClose, onRecordCountChange, selectedAssetId]);

  const mergeAssetDetails = useCallback(
    (updatedDetails: readonly AssetDetail[]) => {
      const updatedDetailsById = new Map(updatedDetails.map(detail => [detail.id, detail]));

      setSelectedAssetDetail(current => {
        if (!selectedAssetId && !current) {
          return current;
        }

        const targetId = current?.id ?? selectedAssetId;
        const updatedDetail = targetId ? updatedDetailsById.get(targetId) : undefined;
        return updatedDetail ?? current;
      });
      setAssetDetailsById(current => mergeCachedAssetDetails(current, updatedDetails));
    },
    [selectedAssetId],
  );

  return {
    selectedAssetDetail,
    assetDetailsById,
    relatedRecordDetailsById,
    mergeAssetDetails,
  };
}

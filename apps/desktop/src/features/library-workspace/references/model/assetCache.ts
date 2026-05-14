import type {
  AssetDetail,
  AssetRecordCount,
  AssetSummary,
  CroquisRecordDetail,
  CroquisRecordSummary,
} from '@/shared/types';

export function createRelatedRecordDetailMap(
  records: readonly CroquisRecordSummary[],
  results: readonly PromiseSettledResult<CroquisRecordDetail>[],
) {
  const detailsById = new Map<string, CroquisRecordDetail>();

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      detailsById.set(records[index].id, result.value);
    }
  });

  return detailsById;
}

export function createAssetRecordCountMap(
  assets: readonly AssetSummary[],
  recordCounts: readonly AssetRecordCount[],
) {
  const assetIds = new Set(assets.map(asset => asset.id));
  const recordCountsById = new Map(assets.map(asset => [asset.id, 0]));

  for (const recordCount of recordCounts) {
    if (assetIds.has(recordCount.assetId)) {
      recordCountsById.set(recordCount.assetId, recordCount.relatedRecordCount);
    }
  }

  return recordCountsById;
}

export function mergeCachedAssetDetails(
  current: Map<string, AssetDetail>,
  updatedDetails: readonly AssetDetail[],
) {
  if (updatedDetails.length === 0 || current.size === 0) {
    return current;
  }

  let changed = false;
  const nextDetailsById = new Map(current);

  for (const detail of updatedDetails) {
    if (nextDetailsById.has(detail.id)) {
      nextDetailsById.set(detail.id, detail);
      changed = true;
    }
  }

  return changed ? nextDetailsById : current;
}

export function mergeCachedAssetRecordCounts(
  current: Map<string, number>,
  updatedDetails: readonly AssetDetail[],
) {
  if (updatedDetails.length === 0 || current.size === 0) {
    return current;
  }

  let changed = false;
  const nextRecordCountsById = new Map(current);

  for (const detail of updatedDetails) {
    if (nextRecordCountsById.has(detail.id)) {
      nextRecordCountsById.set(detail.id, detail.relatedRecords.length);
      changed = true;
    }
  }

  return changed ? nextRecordCountsById : current;
}

import type { RecordResultItem } from '../types';

export function createRecordsBySourceAssetId(items: readonly RecordResultItem[]) {
  const itemsBySourceAssetId = new Map<string, RecordResultItem[]>();

  for (const item of items) {
    if (!item.sourceAssetId) {
      continue;
    }

    const sourceItems = itemsBySourceAssetId.get(item.sourceAssetId) ?? [];
    sourceItems.push(item);
    itemsBySourceAssetId.set(item.sourceAssetId, sourceItems);
  }

  return itemsBySourceAssetId;
}

export function getRelatedRecords(
  item: RecordResultItem,
  itemsBySourceAssetId: ReadonlyMap<string, readonly RecordResultItem[]>,
) {
  if (!item.sourceAssetId) {
    return [];
  }

  const sourceItems = itemsBySourceAssetId.get(item.sourceAssetId) ?? [];
  return sourceItems.filter(candidate => candidate.id !== item.id);
}

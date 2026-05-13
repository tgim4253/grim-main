import type { CroquisRecordDetail, CroquisRecordSummary, Tag } from '@/shared/types';

export function createDetailMap(details: readonly CroquisRecordDetail[]) {
  const detailsById = new Map<string, CroquisRecordDetail>();

  details.forEach(detail => {
    detailsById.set(detail.id, detail);
  });

  return detailsById;
}

export function getTagIds(tags: readonly Tag[]) {
  return tags.reduce<string[]>((tagIds, tag) => {
    if (tag.id && !tagIds.includes(tag.id)) {
      tagIds.push(tag.id);
    }

    return tagIds;
  }, []);
}

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function recordSummaryFromDetail(detail: CroquisRecordDetail): CroquisRecordSummary {
  return {
    id: detail.id,
    title: detail.title,
    sourceAssetId: detail.sourceAssetId,
    resultAssetId: detail.resultAssetId,
    targetDurationSeconds: detail.targetDurationSeconds,
    actualDurationSeconds: detail.actualDurationSeconds,
    finishedAt: detail.finishedAt,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}

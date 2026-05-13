import type { Tag, TagGroup, TagIndex } from '@/shared/types';
import type {
  RecordExplorerFilterGroup,
  RecordExplorerSelectedFilters,
  SelectedRecordFilters,
} from './filterTypes';
import type { RecordResultItem } from '../types';

export type { SelectedRecordFilters } from './filterTypes';

export const EMPTY_TAG_INDEX: TagIndex = {
  groups: [],
  tags: [],
};

export const UNGROUPED_RECORD_FILTER_GROUP_KEY = '__record-filter-group:ungrouped__';

export function compareBySortOrderThenName(
  first: Pick<Tag | TagGroup, 'name' | 'sortOrder'>,
  second: Pick<Tag | TagGroup, 'name' | 'sortOrder'>,
) {
  if (first.sortOrder !== second.sortOrder) {
    return first.sortOrder - second.sortOrder;
  }

  return first.name.localeCompare(second.name);
}

export function getRecordFilterGroupKey(groupId: string | null) {
  return groupId ?? UNGROUPED_RECORD_FILTER_GROUP_KEY;
}

export function createRecordFilterGroups(tagIndex: TagIndex): RecordExplorerFilterGroup[] {
  const tagsByGroupId = new Map<string | null, Tag[]>();

  for (const tag of tagIndex.tags) {
    const groupId = tag.groupId ?? null;
    const groupTags = tagsByGroupId.get(groupId) ?? [];
    groupTags.push(tag);
    tagsByGroupId.set(groupId, groupTags);
  }

  const groups = [...tagIndex.groups]
    .sort(compareBySortOrderThenName)
    .map<RecordExplorerFilterGroup>(group => ({
      key: getRecordFilterGroupKey(group.id),
      label: group.name,
      tags: [...(tagsByGroupId.get(group.id) ?? [])].sort(compareBySortOrderThenName).map(tag => ({
        id: tag.id,
        name: tag.name,
      })),
    }))
    .filter(group => group.tags.length > 0);

  const ungroupedTags = [...(tagsByGroupId.get(null) ?? [])].sort(compareBySortOrderThenName);
  if (ungroupedTags.length > 0) {
    groups.push({
      key: UNGROUPED_RECORD_FILTER_GROUP_KEY,
      label: 'Ungrouped',
      tags: ungroupedTags.map(tag => ({
        id: tag.id,
        name: tag.name,
      })),
    });
  }

  return groups;
}

export function hasActiveSelectedRecordFilters(selectedFilters: RecordExplorerSelectedFilters) {
  return Object.values(selectedFilters).some(tagIds => tagIds.length > 0);
}

export function recordMatchesSelectedFilters(
  record: RecordResultItem,
  selectedFilters: RecordExplorerSelectedFilters,
) {
  const selectedTagGroups = Object.values(selectedFilters).filter(tagIds => tagIds.length > 0);
  if (selectedTagGroups.length === 0) {
    return true;
  }

  const recordTagIds = new Set(record.tags.map(tag => tag.id));

  return selectedTagGroups.every(tagIds => tagIds.some(tagId => recordTagIds.has(tagId)));
}

export function pruneSelectedRecordFilters(
  selectedFilters: SelectedRecordFilters,
  filterGroups: readonly RecordExplorerFilterGroup[],
) {
  const validTagsByGroupKey = new Map(
    filterGroups.map(group => [group.key, new Set(group.tags.map(tag => tag.id))]),
  );
  const nextFilters: SelectedRecordFilters = {};
  let changed = false;

  for (const [groupKey, tagIds] of Object.entries(selectedFilters)) {
    const validTagIds = validTagsByGroupKey.get(groupKey);
    if (!validTagIds) {
      changed = true;
      continue;
    }

    const nextTagIds = tagIds.filter(tagId => validTagIds.has(tagId));
    if (nextTagIds.length !== tagIds.length) {
      changed = true;
    }

    if (nextTagIds.length > 0) {
      nextFilters[groupKey] = nextTagIds;
    }
  }

  if (Object.keys(nextFilters).length !== Object.keys(selectedFilters).length) {
    changed = true;
  }

  return changed ? nextFilters : selectedFilters;
}

import type { Tag, TagGroup, TagIndex } from '@/shared/types';

export const UNGROUPED_GROUP_VALUE = '__ungrouped__';

export type TagSettingsSelection =
  | {
      kind: 'group';
      id: string;
    }
  | {
      kind: 'tag';
      id: string;
    }
  | {
      kind: 'new-group';
    }
  | {
      kind: 'new-tag';
      groupId: string | null;
    };

export type TagGroupView = {
  id: string | null;
  name: string;
  tags: Tag[];
  synthetic?: boolean;
};

export const EMPTY_TAG_INDEX: TagIndex = {
  groups: [],
  tags: [],
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function compareBySortOrderThenName(
  first: Pick<Tag | TagGroup, 'name' | 'sortOrder'>,
  second: Pick<Tag | TagGroup, 'name' | 'sortOrder'>,
) {
  if (first.sortOrder !== second.sortOrder) {
    return first.sortOrder - second.sortOrder;
  }

  return first.name.localeCompare(second.name);
}

export function normalizeName(value: string) {
  return value.trim();
}

export function parseSortOrder(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue)) {
    return undefined;
  }

  return Math.trunc(parsedValue);
}

export function getNextGroupSortOrder(groups: readonly TagGroup[]) {
  if (groups.length === 0) {
    return 0;
  }

  return Math.max(...groups.map(group => group.sortOrder)) + 10;
}

export function getNextTagSortOrder(tags: readonly Tag[], groupId: string | null) {
  const siblingSortOrders = tags
    .filter(tag => (tag.groupId ?? null) === groupId)
    .map(tag => tag.sortOrder);

  if (siblingSortOrders.length === 0) {
    return 0;
  }

  return Math.max(...siblingSortOrders) + 10;
}

export function getSelectionKey(selection: TagSettingsSelection) {
  if (selection.kind === 'new-group') {
    return 'new-group';
  }

  if (selection.kind === 'new-tag') {
    return `new-tag:${selection.groupId ?? UNGROUPED_GROUP_VALUE}`;
  }

  return `${selection.kind}:${selection.id}`;
}

export function getGroupedTags(tagIndex: TagIndex, t: Translate): TagGroupView[] {
  const groupedTags = new Map<string | null, Tag[]>();

  for (const tag of tagIndex.tags) {
    const groupId = tag.groupId ?? null;
    const tags = groupedTags.get(groupId) ?? [];
    tags.push(tag);
    groupedTags.set(groupId, tags);
  }

  const groups = [...tagIndex.groups].sort(compareBySortOrderThenName).map<TagGroupView>(group => ({
    id: group.id,
    name: group.name,
    tags: [...(groupedTags.get(group.id) ?? [])].sort(compareBySortOrderThenName),
  }));

  const ungroupedTags = [...(groupedTags.get(null) ?? [])].sort(compareBySortOrderThenName);
  if (ungroupedTags.length > 0) {
    groups.push({
      id: null,
      name: t('tags.ungrouped', { defaultValue: 'Ungrouped' }),
      tags: ungroupedTags,
      synthetic: true,
    });
  }

  return groups;
}

export function formatTagCount(tagCount: number, t: Translate) {
  return t('tags.count', {
    count: tagCount,
    formattedCount: tagCount.toLocaleString(),
    defaultValue: '{{formattedCount}} TAGS',
  });
}

export function getPanelTitle(selection: TagSettingsSelection, t: Translate) {
  if (selection.kind === 'group' || selection.kind === 'new-group') {
    return selection.kind === 'new-group'
      ? t('tags.new_group', { defaultValue: 'New Group' })
      : t('tags.tag_group', { defaultValue: 'Tag Group' });
  }

  return selection.kind === 'new-tag'
    ? t('tags.new_tag', { defaultValue: 'New Tag' })
    : t('tags.detail', { defaultValue: 'Tag Detail' });
}

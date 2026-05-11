import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  type SelectFilterOptions,
  type SelectOption,
  type SelectProps,
} from '../../../shared/ui';
import type { Tag, TagGroup } from '../../../shared/types';

export type TagSearchFilter = (
  query: string,
  tags: readonly Tag[],
  groupsById: ReadonlyMap<string, TagGroup>,
) => Tag[];

export type TagSearchSelectProps = Omit<
  SelectProps,
  'defaultValue' | 'filterOptions' | 'onValueChange' | 'options' | 'type' | 'value'
> & {
  tags: readonly Tag[];
  groups?: readonly TagGroup[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (tagId: string, tag?: Tag) => void;
  filterTags?: TagSearchFilter;
};

const normalizeSearchText = (value: string) => value.trim().toLocaleLowerCase();

const getTagGroupName = (tag: Tag, groupsById: ReadonlyMap<string, TagGroup>) =>
  tag.groupId ? groupsById.get(tag.groupId)?.name : undefined;

export const filterTagSearchOptions: TagSearchFilter = (query, tags, groupsById) => {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return [...tags];
  }

  return tags.filter(tag => {
    const groupName = getTagGroupName(tag, groupsById);
    return [tag.name, groupName, tag.color].some(text =>
      text?.toLocaleLowerCase().includes(normalizedQuery),
    );
  });
};

const getTagOption = (
  tag: Tag,
  groupsById: ReadonlyMap<string, TagGroup>,
  ungroupedLabel: string,
): SelectOption => ({
  value: tag.id,
  label: tag.name,
  supportingText: getTagGroupName(tag, groupsById) ?? ungroupedLabel,
});

export function TagSearchSelect({
  tags,
  groups = [],
  value,
  defaultValue,
  onValueChange,
  filterTags = filterTagSearchOptions,
  placeholder,
  emptyMessage,
  searchValue,
  onSearchValueChange,
  ...props
}: TagSearchSelectProps) {
  const { t } = useTranslation('common');
  const ungroupedLabel = t('tags.ungrouped', { defaultValue: 'Ungrouped' });
  const resolvedPlaceholder = placeholder ?? t('tags.search_tags', { defaultValue: 'Search tags' });
  const resolvedEmptyMessage =
    emptyMessage ?? t('tags.no_tags_found', { defaultValue: 'No tags found' });
  const groupsById = useMemo(() => {
    const nextGroupsById = new Map<string, TagGroup>();

    groups.forEach(group => {
      nextGroupsById.set(group.id, group);
    });

    return nextGroupsById;
  }, [groups]);

  const tagById = useMemo(() => {
    const nextTagById = new Map<string, Tag>();

    tags.forEach(tag => {
      nextTagById.set(tag.id, tag);
    });

    return nextTagById;
  }, [tags]);

  const isValueControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const resolvedValue = isValueControlled ? value : internalValue;
  const selectedTag = resolvedValue ? tagById.get(resolvedValue) : undefined;
  const selectedTagName = selectedTag?.name ?? '';

  const isSearchValueControlled = searchValue !== undefined;
  const [internalSearchValue, setInternalSearchValue] = useState(selectedTagName);
  const resolvedSearchValue = isSearchValueControlled ? searchValue : internalSearchValue;

  const options = useMemo(
    () => tags.map(tag => getTagOption(tag, groupsById, ungroupedLabel)),
    [groupsById, tags, ungroupedLabel],
  );

  const filterOptions = useCallback<SelectFilterOptions>(
    query =>
      filterTags(query, tags, groupsById).map(tag => getTagOption(tag, groupsById, ungroupedLabel)),
    [filterTags, groupsById, tags, ungroupedLabel],
  );

  const handleSearchValueChange = useCallback(
    (nextSearchValue: string) => {
      if (!isSearchValueControlled) {
        setInternalSearchValue(nextSearchValue);
      }

      onSearchValueChange?.(nextSearchValue);
    },
    [isSearchValueControlled, onSearchValueChange],
  );

  const handleValueChange = useCallback(
    (nextValue: string) => {
      if (!isValueControlled) {
        setInternalValue(nextValue);
      }

      onValueChange?.(nextValue, tagById.get(nextValue));
    },
    [isValueControlled, onValueChange, tagById],
  );

  useEffect(() => {
    if (!isSearchValueControlled) {
      setInternalSearchValue(selectedTagName);
    }
  }, [isSearchValueControlled, selectedTagName]);

  return (
    <Select
      {...props}
      type="search"
      options={options}
      value={resolvedValue}
      onValueChange={handleValueChange}
      placeholder={resolvedPlaceholder}
      searchValue={resolvedSearchValue}
      onSearchValueChange={handleSearchValueChange}
      filterOptions={filterOptions}
      emptyMessage={resolvedEmptyMessage}
    />
  );
}

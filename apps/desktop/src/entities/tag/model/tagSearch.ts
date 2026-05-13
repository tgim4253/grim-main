import type { Tag, TagGroup } from './types';

export type TagSearchFilter = (
  query: string,
  tags: readonly Tag[],
  groupsById: ReadonlyMap<string, TagGroup>,
) => Tag[];

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

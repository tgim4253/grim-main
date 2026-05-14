import type { VirtualFolder } from './types';

export type FolderSearchFilter = (
  query: string,
  folders: readonly VirtualFolder[],
) => VirtualFolder[];

const normalizeSearchText = (value: string) => value.trim().toLocaleLowerCase();

export const filterFolderSearchOptions: FolderSearchFilter = (query, folders) => {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return [...folders];
  }

  return folders.filter(folder =>
    [folder.name, folder.fullPath, folder.alias, folder.kind].some(text =>
      text?.toLocaleLowerCase().includes(normalizedQuery),
    ),
  );
};

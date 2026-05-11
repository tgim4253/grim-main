import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Icon,
  Select,
  type SelectFilterOptions,
  type SelectOption,
  type SelectProps,
} from '../../../shared/ui';
import type { VirtualFolder } from '../../../shared/types';

export type FolderSearchFilter = (
  query: string,
  folders: readonly VirtualFolder[],
) => VirtualFolder[];

export type FolderSearchSelectProps = Omit<
  SelectProps,
  'defaultValue' | 'filterOptions' | 'onValueChange' | 'options' | 'type' | 'value'
> & {
  folders: readonly VirtualFolder[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (folderId: string, folder?: VirtualFolder) => void;
  filterFolders?: FolderSearchFilter;
};

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

const getFolderOption = (folder: VirtualFolder): SelectOption => ({
  value: folder.id,
  label: folder.fullPath,
  supportingText: folder.alias ?? undefined,
  menuLeading: <Icon name="folder" size="md" hierarchy="tertiary" aria-hidden />,
});

export function FolderSearchSelect({
  folders,
  value,
  defaultValue,
  onValueChange,
  filterFolders = filterFolderSearchOptions,
  placeholder,
  emptyMessage,
  searchValue,
  onSearchValueChange,
  ...props
}: FolderSearchSelectProps) {
  const { t } = useTranslation('common');
  const resolvedPlaceholder =
    placeholder ?? t('folders.search_folders', { defaultValue: 'Search folders' });
  const resolvedEmptyMessage =
    emptyMessage ?? t('folders.no_folders_found', { defaultValue: 'No folders found' });
  const folderById = useMemo(() => {
    const nextFolderById = new Map<string, VirtualFolder>();

    folders.forEach(folder => {
      nextFolderById.set(folder.id, folder);
    });

    return nextFolderById;
  }, [folders]);

  const isValueControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const resolvedValue = isValueControlled ? value : internalValue;
  const selectedFolder = resolvedValue ? folderById.get(resolvedValue) : undefined;
  const selectedFolderPath = selectedFolder?.fullPath ?? '';

  const isSearchValueControlled = searchValue !== undefined;
  const [internalSearchValue, setInternalSearchValue] = useState(selectedFolderPath);
  const resolvedSearchValue = isSearchValueControlled ? searchValue : internalSearchValue;

  const options = useMemo(() => folders.map(getFolderOption), [folders]);

  const filterOptions = useCallback<SelectFilterOptions>(
    query => filterFolders(query, folders).map(getFolderOption),
    [filterFolders, folders],
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

      onValueChange?.(nextValue, folderById.get(nextValue));
    },
    [folderById, isValueControlled, onValueChange],
  );

  useEffect(() => {
    if (!isSearchValueControlled) {
      setInternalSearchValue(selectedFolderPath);
    }
  }, [isSearchValueControlled, selectedFolderPath]);

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

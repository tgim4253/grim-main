export type RecordExplorerFilterTag = {
  id: string;
  name: string;
};

export type RecordExplorerFilterGroup = {
  key: string;
  label: string;
  tags: readonly RecordExplorerFilterTag[];
};

export type RecordExplorerSelectedFilters = Readonly<Record<string, readonly string[]>>;

export type SelectedRecordFilters = Record<string, string[]>;

import type { AssetListSource } from '../../shared/types';

export type ExplorerNodeIcon = 'anatomy' | 'gesture' | 'folder' | 'folder-open' | 'grid';

export type ExplorerNode = {
  id: string;
  label: string;
  icon: ExplorerNodeIcon;
  meta: string;
  source?: AssetListSource;
  children?: ExplorerNode[];
  defaultExpanded?: boolean;
  showActions?: boolean;
};

export type ExplorerCreateFolderRequest = {
  parentId: string | null;
  name: string;
};

export type ExplorerFolderDraft = {
  parentNodeId: string;
  pending?: boolean;
  error?: string | null;
};

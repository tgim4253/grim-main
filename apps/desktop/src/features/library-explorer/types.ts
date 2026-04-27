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

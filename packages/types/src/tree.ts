import { NodeApi, TreeApi } from 'react-arborist';
import { type PanelTypes } from './index';

export interface FileTreeData {
  id: string;
  name: string;
  path: string;
  icon?: string;
  children?: FileTreeData[];
  type: PanelTypes.PanelType;
}

export type FileTreeApi = TreeApi<FileTreeData>;
export type FileNodeApi = NodeApi<FileTreeData>;

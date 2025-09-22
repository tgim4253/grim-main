import { NodeKind } from './graph';
import { FileType } from './file';

export interface FileTreeData {
  id: string;
  name: string;
  icon?: string;
  children?: FileTreeData[];
  type: NodeKind;
  fileType?: FileType;
  isGroup?: boolean;
  groupType?: FileType;
}

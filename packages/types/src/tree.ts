export type FileTreeNodeType = 'folder' | 'file';
export interface FileTreeData {
  id: string;
  name: string;
  icon?: string;
  children?: FileTreeData[];
  type: FileTreeNodeType;
}

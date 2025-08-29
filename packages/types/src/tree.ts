import { NodeKind } from "./graph";

export interface FileTreeData {
  id: string;
  name: string;
  icon?: string;
  children?: FileTreeData[];
  type: NodeKind;
}

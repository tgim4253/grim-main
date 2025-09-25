import { NodeKind } from "./graph";
import { FolderHealthState, FolderMountState } from "./file";

export interface FileTreeData {
  id: string;
  name: string;
  icon?: string;
  children?: FileTreeData[];
  type: NodeKind;
  status?: FolderHealthState;
  mounts?: FolderMountState[];
}

export interface GraphResponse {
  nodes: Node[];
  connections: Connection[];
}

export interface Connection {
  id: string;
  src_node_id: string;
  dst_node_id: string;
  kind_rule_id: string;
  kind: string;
  weight: number;
}

export interface Node {
  id: string;
  kind: string;
  data: any;
  created_at: string;
  updated_at: string;
}

export enum NodeKind {
  Folder = 'folder',
  File = 'file',
}
export type NodeData = NodeFolder | NodeFile;

export interface NodeFolder {
  folder_id: string;
  node_id: string;
  real_folder_id: string | null;
  folder_name: string | null;
}

export interface NodeFile {
  file_id: string;
  node_id: string;
  sha256: string | null;
  file_name: string | null;
}

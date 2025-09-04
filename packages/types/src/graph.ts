export interface GraphResponse {
  nodes: Node[];
  connections: Connection[];
  root_node_id: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphConnection[];
}

export interface GraphNode {
  id: string;
  nodeId: string;
  label: string;
  size: number;
  type: GraphNodeType;
}

export type GraphNodeType = 'folder' | 'tag' | 'image' | 'document' | 'default' | string;

export interface GraphConnection {
  source: string;
  target: string;
  label: string;

  data: Connection;
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
  data: {
    ['File']?: NodeFile;
    ['Folder']?: NodeFolder;
  };
  created_at: string;
  updated_at: string;
}

export enum NodeKind {
  Folder = 'folder',
  File = 'file',
}

export interface NodeFolder {
  folder_id: string;
  node_id: string;
  folder_name: string | null;
}

export interface NodeFile {
  file_id: string;
  node_id: string;
  sha256: string | null;
  xxh3_64: string;
  kind: FileType;
  file_name: string;
  size: number;
}

export enum FileType {
  Image = 'image',
  Video = 'video',
  Document = 'document',
  GraphicTool = 'graphictool',
  Audio = 'audio',
  Archive = 'archive',
  Unknown = 'unknown',
}

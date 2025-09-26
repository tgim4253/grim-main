import { FileType, FolderHealthState, FolderMountState } from './file';

export interface GraphResponse {
  nodes: Node[];
  connections: Connection[];
  rootNodeId: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphConnection[];
}

export interface GraphNode {
  [others: string]: any;
  id: string;
  nodeId: string;
  label: string;
  size: number;
  type: GraphNodeType;
  depth?: number;
  isLeaf?: boolean;
  url?: string;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
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
  srcNodeId: string;
  dstNodeId: string;
  kindRuleId: string;
  kind: RelationType;
  level: number;
}

export interface Node {
  id: string;
  kind: string;
  data: {
    ['File']?: NodeFile;
    ['Folder']?: NodeFolder;
  };
  createdAt: string;
  updatedAt: string;
}

export enum NodeKind {
  Folder = 'folder',
  File = 'file',
}

export interface NodeFolder {
  folderId: string;
  nodeId: string;
  folderName: string | null;
  mounts?: FolderMountState[];
  health?: FolderHealthState;
}

export interface NodeFile {
  fileId: string;
  nodeId: string;
  sha256: string | null;
  xxh364: string;
  kind: FileType;
  fileName: string;
  size: number;
}

export enum RelationType {
  ContainsFile = 'containsfile',
  BelongToFolder = 'belongtofolder',
  ParentFolder = 'parentfolder',
  ChildFolder = 'childfolder',
  CroquisLink = 'croquislink',
}

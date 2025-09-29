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
  crop?: NodeCrop;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

export type GraphNodeType =
  | 'folder'
  | 'tag'
  | 'image'
  | 'document'
  | 'crop'
  | 'default'
  | string;

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
  kind: NodeKind;
  data: {
    ['File']?: NodeFile;
    ['Folder']?: NodeFolder;
    ['Crop']?: NodeCrop;
  };
  createdAt: string;
  updatedAt: string;
}

export enum NodeKind {
  Folder = 'folder',
  File = 'file',
  Tag = 'tag',
  Annotation = 'annotation',
  Memo = 'memo',
  Crop = 'crop',
  Unknown = 'unknown',
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

export interface NodeCrop {
  nodeId: string;
  originHash: string;
  startX: number;
  startY: number;
  width: number;
  height: number;
  referenceWidth?: number | null;
  referenceHeight?: number | null;
  isRelative: boolean;
  createdAt: string;
  updatedAt: string;
}

export enum RelationType {
  ContainsFile = 'containsfile',
  BelongToFolder = 'belongtofolder',
  ParentFolder = 'parentfolder',
  ChildFolder = 'childfolder',
  RelativeImage = 'relativeimage',
  CroquisResLink = 'croquisreslink',
  CroquisRefLink = 'croquisreflink',
  Cropped = 'cropped',
  CroppedOrigin = 'croppedorigin',
}

export interface CropRectangle {
  startX: number;
  startY: number;
  width: number;
  height: number;
}

export interface CreateImageCropPayload {
  originNodeId: string;
  originHash: string;
  rect: CropRectangle;
  referenceWidth?: number | null;
  referenceHeight?: number | null;
  isRelative?: boolean;
}

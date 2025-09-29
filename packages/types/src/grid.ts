import { GraphNodeType } from './graph';

export type GridData = {
  images: ImageItem[];
};

export type Size = 'small' | 'medium' | 'large';

export type Layout = 'grid' | 'masonry';

export type GridType = GraphNodeType;

export interface ImageItem {
  id: string;
  nodeId: string;
  type: GridType;
  name: string;
  hash: string;
  size: number;
}

import type { LibraryWorkspaceItem, MasonryImageRatio } from '../common/types';

export type ConnectedImageTone = 'portrait' | 'gesture' | 'shape' | 'add';

export type ConnectedImageItem = {
  id: string;
  tone: ConnectedImageTone;
  active?: boolean;
};

export type ReferenceAsset = LibraryWorkspaceItem & {
  title: string;
  imageSrc?: string | null;
  thumbnailSrc?: string | null;
  ratio: MasonryImageRatio;
  height: number;
  metadata: {
    resolution: string;
    addedAt: string;
    lastCroquisAt: string;
  };
  folders: readonly string[];
  croquisResult: {
    label: string;
    status: string;
    connectedImages: readonly ConnectedImageItem[];
  };
};

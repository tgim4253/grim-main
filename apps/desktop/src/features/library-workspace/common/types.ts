import type { ReactNode } from 'react';

export type LibraryWorkspaceMode = 'references' | 'records';

export type LibraryWorkspaceLayout = 'grid' | 'masonry';

export type MasonryImageRatio = '2:5' | '3:5' | '4:5' | '3:4';

export type ImagePlaceholderState = 'default' | 'hover' | 'active';

export type LibraryWorkspaceItem = {
  id: string;
};

export type LibraryWorkspaceRenderTileState = {
  layout: LibraryWorkspaceLayout;
  selected: boolean;
  selectionIndex?: number;
  selectionMode?: boolean;
  onFocus: () => void;
  onSelect: () => void;
};

export type LibraryWorkspaceHeaderProps = {
  mode: LibraryWorkspaceMode;
  itemCount: number;
  layout: LibraryWorkspaceLayout;
  onLayoutChange: (layout: LibraryWorkspaceLayout) => void;
};

export type LibraryWorkspaceRenderHeader = (props: LibraryWorkspaceHeaderProps) => ReactNode;

export type LibraryWorkspaceRenderPreview<TItem extends LibraryWorkspaceItem> = (
  item: TItem,
) => ReactNode;

export type LibraryWorkspaceRenderTile<TItem extends LibraryWorkspaceItem> = (
  item: TItem,
  state: LibraryWorkspaceRenderTileState,
) => ReactNode;

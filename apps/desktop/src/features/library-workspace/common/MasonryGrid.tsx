import type { ReactNode } from 'react';
import type {
  LibraryWorkspaceItem,
  LibraryWorkspaceLayout,
  LibraryWorkspaceRenderTile,
} from './types';

type MasonryGridProps<TItem extends LibraryWorkspaceItem> = {
  items: readonly TItem[];
  layout: LibraryWorkspaceLayout;
  ariaLabel: string;
  selectedItemId?: string;
  busy?: boolean;
  emptyState?: ReactNode;
  onSelectedItemChange?: (itemId: string) => void;
  renderTile: LibraryWorkspaceRenderTile<TItem>;
};

export function MasonryGrid<TItem extends LibraryWorkspaceItem>({
  items,
  layout,
  ariaLabel,
  selectedItemId,
  busy = false,
  emptyState = null,
  onSelectedItemChange,
  renderTile,
}: MasonryGridProps<TItem>) {
  const renderItem = (item: TItem) => {
    const selected = item.id === selectedItemId;
    const onSelect = () => {
      onSelectedItemChange?.(item.id);
    };

    return (
      <div className="masonry-grid__item" role="listitem" key={item.id}>
        {renderTile(item, { layout, selected, onSelect })}
      </div>
    );
  };

  return (
    <div className="masonry-grid" data-layout={layout}>
      <div
        className="masonry-grid__content"
        role={items.length > 0 ? 'list' : undefined}
        aria-label={ariaLabel}
        aria-busy={busy}
      >
        {items.length > 0 ? items.map(renderItem) : emptyState}
      </div>
    </div>
  );
}

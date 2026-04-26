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
  onSelectedItemChange?: (itemId: string) => void;
  renderTile: LibraryWorkspaceRenderTile<TItem>;
};

export function MasonryGrid<TItem extends LibraryWorkspaceItem>({
  items,
  layout,
  ariaLabel,
  selectedItemId,
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
      <div className="masonry-grid__content" role="list" aria-label={ariaLabel}>
        {items.map(renderItem)}
      </div>
    </div>
  );
}

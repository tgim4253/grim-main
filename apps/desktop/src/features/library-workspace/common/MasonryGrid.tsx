import { useMemo, type ReactNode } from 'react';
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
  selectedItemIds?: readonly string[];
  selectionMode?: boolean;
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
  selectedItemIds = [],
  selectionMode = false,
  busy = false,
  emptyState = null,
  onSelectedItemChange,
  renderTile,
}: MasonryGridProps<TItem>) {
  const selectedItemOrder = useMemo(() => {
    const orderByItemId = new Map<string, number>();
    selectedItemIds.forEach((itemId, index) => {
      if (!orderByItemId.has(itemId)) {
        orderByItemId.set(itemId, index + 1);
      }
    });

    return orderByItemId;
  }, [selectedItemIds]);

  const renderItem = (item: TItem) => {
    const selectionIndex = selectedItemOrder.get(item.id);
    const selected = selectionMode ? selectionIndex !== undefined : item.id === selectedItemId;
    const onSelect = () => {
      onSelectedItemChange?.(item.id);
    };

    return (
      <div className="masonry-grid__item" role="listitem" key={item.id}>
        {renderTile(item, {
          layout,
          selected,
          selectionIndex,
          selectionMode,
          onSelect,
        })}
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

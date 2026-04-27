import type { ReactNode } from 'react';
import { MasonryGrid } from './MasonryGrid';
import type {
  LibraryWorkspaceItem,
  LibraryWorkspaceLayout,
  LibraryWorkspaceMode,
  LibraryWorkspaceRenderHeader,
  LibraryWorkspaceRenderPreview,
  LibraryWorkspaceRenderTile,
} from './types';
import './library-workspace.css';

type LibraryWorkspaceProps<TItem extends LibraryWorkspaceItem> = {
  mode?: LibraryWorkspaceMode;
  items: readonly TItem[];
  layout: LibraryWorkspaceLayout;
  selectedItemId?: string;
  selectedItemIds?: readonly string[];
  selectionMode?: boolean;
  gridAriaLabel: string;
  previewOpen?: boolean;
  gridBusy?: boolean;
  gridEmptyState?: ReactNode;
  onLayoutChange: (layout: LibraryWorkspaceLayout) => void;
  onSelectedItemChange?: (itemId: string) => void;
  renderHeader: LibraryWorkspaceRenderHeader;
  renderToolbar?: ReactNode;
  renderPreview?: LibraryWorkspaceRenderPreview<TItem>;
  renderTile: LibraryWorkspaceRenderTile<TItem>;
};

export function LibraryWorkspace<TItem extends LibraryWorkspaceItem>({
  mode = 'references',
  items,
  layout,
  selectedItemId,
  selectedItemIds = [],
  selectionMode = false,
  gridAriaLabel,
  previewOpen = true,
  gridBusy = false,
  gridEmptyState = null,
  onLayoutChange,
  onSelectedItemChange,
  renderHeader,
  renderToolbar = null,
  renderPreview,
  renderTile,
}: LibraryWorkspaceProps<TItem>) {
  let selectedItem: TItem | null = null;

  if (selectedItemId && items.length > 0) {
    selectedItem = items.find(item => item.id === selectedItemId) ?? null;
  }

  const previewNode = selectedItem !== null && renderPreview ? renderPreview(selectedItem) : null;
  const previewVisible =
    previewOpen && previewNode !== null && previewNode !== undefined && previewNode !== false;
  const previewState = previewVisible ? 'open' : 'closed';

  return (
    <section className="library-workspace" data-mode={mode}>
      <div className="library-workspace__explorer">
        {renderHeader({
          mode,
          itemCount: items.length,
          layout,
          onLayoutChange,
        })}
        {renderToolbar}
        <div className="library-workspace__grid-region">
          <MasonryGrid
            items={items}
            layout={layout}
            ariaLabel={gridAriaLabel}
            selectedItemId={selectedItem?.id}
            selectedItemIds={selectedItemIds}
            selectionMode={selectionMode}
            busy={gridBusy}
            emptyState={gridEmptyState}
            onSelectedItemChange={onSelectedItemChange}
            renderTile={renderTile}
          />
        </div>
      </div>

      {renderPreview ? (
        <div
          className="library-workspace__preview-shell"
          data-state={previewState}
          aria-hidden={!previewVisible}
        >
          {previewNode}
        </div>
      ) : null}
    </section>
  );
}

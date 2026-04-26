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
  gridAriaLabel: string;
  previewOpen?: boolean;
  onLayoutChange: (layout: LibraryWorkspaceLayout) => void;
  onSelectedItemChange?: (itemId: string) => void;
  renderHeader: LibraryWorkspaceRenderHeader;
  renderPreview?: LibraryWorkspaceRenderPreview<TItem>;
  renderTile: LibraryWorkspaceRenderTile<TItem>;
};

export function LibraryWorkspace<TItem extends LibraryWorkspaceItem>({
  mode = 'references',
  items,
  layout,
  selectedItemId,
  gridAriaLabel,
  previewOpen = true,
  onLayoutChange,
  onSelectedItemChange,
  renderHeader,
  renderPreview,
  renderTile,
}: LibraryWorkspaceProps<TItem>) {
  let selectedItem: TItem | null = null;

  if (items.length > 0) {
    selectedItem = items.find(item => item.id === selectedItemId) ?? items[0];
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
        <div className="library-workspace__grid-region">
          <MasonryGrid
            items={items}
            layout={layout}
            ariaLabel={gridAriaLabel}
            selectedItemId={selectedItem?.id}
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

import { Icon } from '../../../shared/ui/icon/Icon';
import { IconButton } from '../../../shared/ui/icon-button/IconButton';
import type { LibraryWorkspaceLayout, LibraryWorkspaceMode } from '../common/types';

type ReferenceExplorerHeaderProps = {
  mode: LibraryWorkspaceMode;
  itemCount: number;
  layout: LibraryWorkspaceLayout;
  onLayoutChange: (layout: LibraryWorkspaceLayout) => void;
};

function formatItemCount(itemCount: number) {
  return `${itemCount.toLocaleString()} Items`;
}

export function ReferenceExplorerHeader({
  mode,
  itemCount,
  layout,
  onLayoutChange,
}: ReferenceExplorerHeaderProps) {
  const handleGridViewClick = () => {
    if (layout !== 'grid') {
      onLayoutChange('grid');
    }
  };

  const handleMasonryViewClick = () => {
    if (layout !== 'masonry') {
      onLayoutChange('masonry');
    }
  };

  return (
    <header className="reference-explorer-header" data-mode={mode}>
      <div className="reference-explorer-header__leading">
        <button type="button" className="reference-explorer-header__filter">
          <Icon name="filter" size="sm" hierarchy="tertiary" aria-hidden />
          <span>Filter</span>
        </button>
        <span className="reference-explorer-header__divider" aria-hidden />
      </div>

      <p className="reference-explorer-header__count">{formatItemCount(itemCount)}</p>

      <div className="reference-explorer-header__actions" aria-label="View mode">
        <IconButton
          icon="view-grid"
          size="md"
          active={layout === 'grid'}
          aria-label="Grid view"
          aria-pressed={layout === 'grid'}
          onClick={handleGridViewClick}
        />
        <IconButton
          icon="masonry-item"
          size="md"
          active={layout === 'masonry'}
          aria-label="Masonry view"
          aria-pressed={layout === 'masonry'}
          onClick={handleMasonryViewClick}
        />
      </div>
    </header>
  );
}

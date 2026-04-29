import { Icon, IconButton } from '../../../shared/ui';
import type { LibraryWorkspaceLayout } from '../common/types';

type RecordExplorerHeaderProps = {
  itemCount: number;
  layout: LibraryWorkspaceLayout;
  onLayoutChange: (layout: LibraryWorkspaceLayout) => void;
};

function formatRecordCount(itemCount: number) {
  return `${itemCount.toLocaleString()} Records`;
}

export function RecordExplorerHeader({
  itemCount,
  layout,
  onLayoutChange,
}: RecordExplorerHeaderProps) {
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
    <header className="record-explorer-header">
      <div className="record-explorer-header__leading">
        <button type="button" className="record-explorer-header__filter">
          <Icon name="filter" size="sm" hierarchy="tertiary" aria-hidden />
          <span>Filter</span>
        </button>
        <span className="record-explorer-header__sort">Sort: Newest</span>
        <span className="record-explorer-header__divider" aria-hidden />
        <p className="record-explorer-header__count">{formatRecordCount(itemCount)}</p>
      </div>

      <div className="record-explorer-header__actions" aria-label="View mode">
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

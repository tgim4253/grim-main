import { useTranslation } from 'react-i18next';
import { Icon, IconButton } from '../../../shared/ui';
import type { LibraryWorkspaceLayout } from '../common/types';

type RecordExplorerHeaderProps = {
  itemCount: number;
  layout: LibraryWorkspaceLayout;
  onLayoutChange: (layout: LibraryWorkspaceLayout) => void;
};

export function RecordExplorerHeader({
  itemCount,
  layout,
  onLayoutChange,
}: RecordExplorerHeaderProps) {
  const { t } = useTranslation('common');
  const recordCountLabel = t('records.count', {
    count: itemCount,
    formattedCount: itemCount.toLocaleString(),
    defaultValue: '{{formattedCount}} Records',
  });
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
          <span>{t('common.filter', { defaultValue: 'Filter' })}</span>
        </button>
        <span className="record-explorer-header__sort">
          {t('common.sort_newest', { defaultValue: 'Sort: Newest' })}
        </span>
        <span className="record-explorer-header__divider" aria-hidden />
        <p className="record-explorer-header__count">{recordCountLabel}</p>
      </div>

      <div
        className="record-explorer-header__actions"
        aria-label={t('library.view_mode', { defaultValue: 'View mode' })}
      >
        <IconButton
          icon="view-grid"
          size="md"
          active={layout === 'grid'}
          aria-label={t('library.grid_view', { defaultValue: 'Grid view' })}
          aria-pressed={layout === 'grid'}
          onClick={handleGridViewClick}
        />
        <IconButton
          icon="masonry-item"
          size="md"
          active={layout === 'masonry'}
          aria-label={t('library.masonry_view', { defaultValue: 'Masonry view' })}
          aria-pressed={layout === 'masonry'}
          onClick={handleMasonryViewClick}
        />
      </div>
    </header>
  );
}

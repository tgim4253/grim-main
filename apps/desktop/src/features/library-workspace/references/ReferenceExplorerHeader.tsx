import { useTranslation } from 'react-i18next';
import { Icon } from '../../../shared/ui/icon/Icon';
import { IconButton } from '../../../shared/ui/icon-button/IconButton';
import type { LibraryWorkspaceLayout, LibraryWorkspaceMode } from '../common/types';

type ReferenceExplorerHeaderProps = {
  mode: LibraryWorkspaceMode;
  itemCount: number;
  layout: LibraryWorkspaceLayout;
  onLayoutChange: (layout: LibraryWorkspaceLayout) => void;
};

export function ReferenceExplorerHeader({
  mode,
  itemCount,
  layout,
  onLayoutChange,
}: ReferenceExplorerHeaderProps) {
  const { t } = useTranslation('common');
  const itemCountLabel = t('references.count', {
    count: itemCount,
    formattedCount: itemCount.toLocaleString(),
    defaultValue: '{{formattedCount}} Items',
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
    <header className="reference-explorer-header" data-mode={mode}>
      <div className="reference-explorer-header__leading">
        <button type="button" className="reference-explorer-header__filter">
          <Icon name="filter" size="sm" hierarchy="tertiary" aria-hidden />
          <span>{t('common.filter', { defaultValue: 'Filter' })}</span>
        </button>
        <span className="reference-explorer-header__divider" aria-hidden />
      </div>

      <p className="reference-explorer-header__count">{itemCountLabel}</p>

      <div
        className="reference-explorer-header__actions"
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

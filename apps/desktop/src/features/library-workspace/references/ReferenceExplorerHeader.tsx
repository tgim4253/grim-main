import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckboxRow, Icon, IconButton } from '../../../shared/ui';
import type { LibraryWorkspaceLayout, LibraryWorkspaceMode } from '../common/types';

type ReferenceExplorerHeaderProps = {
  mode: LibraryWorkspaceMode;
  itemCount: number;
  layout: LibraryWorkspaceLayout;
  filterExpanded?: boolean;
  noRecordFilterSelected?: boolean;
  onLayoutChange: (layout: LibraryWorkspaceLayout) => void;
  onFilterExpandedChange?: (expanded: boolean) => void;
  onNoRecordFilterChange?: (selected: boolean) => void;
};

export function ReferenceExplorerHeader({
  mode,
  itemCount,
  layout,
  filterExpanded,
  noRecordFilterSelected,
  onLayoutChange,
  onFilterExpandedChange,
  onNoRecordFilterChange,
}: ReferenceExplorerHeaderProps) {
  const { t } = useTranslation('common');
  const filterPanelId = useId();
  const [internalFilterExpanded, setInternalFilterExpanded] = useState(false);
  const [internalNoRecordFilterSelected, setInternalNoRecordFilterSelected] = useState(false);
  const resolvedFilterExpanded = filterExpanded ?? internalFilterExpanded;
  const resolvedNoRecordFilterSelected = noRecordFilterSelected ?? internalNoRecordFilterSelected;
  const selectedFilterCount = resolvedNoRecordFilterSelected ? 1 : 0;
  const itemCountLabel = t('references.count', {
    count: itemCount,
    formattedCount: itemCount.toLocaleString(),
    defaultValue: '{{formattedCount}} Items',
  });

  const handleFilterClick = () => {
    const nextExpanded = !resolvedFilterExpanded;
    if (onFilterExpandedChange) {
      onFilterExpandedChange(nextExpanded);
      return;
    }

    setInternalFilterExpanded(nextExpanded);
  };

  const handleNoRecordFilterChange = (selected: boolean) => {
    if (onNoRecordFilterChange) {
      onNoRecordFilterChange(selected);
      return;
    }

    setInternalNoRecordFilterSelected(selected);
  };

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
    <div
      className="library-explorer-header-shell reference-explorer-header-shell"
      data-expanded={resolvedFilterExpanded ? 'true' : 'false'}
    >
      <header className="library-explorer-header reference-explorer-header" data-mode={mode}>
        <div className="library-explorer-header__leading reference-explorer-header__leading">
          <button
            type="button"
            className="library-explorer-header__filter reference-explorer-header__filter"
            aria-expanded={resolvedFilterExpanded}
            aria-controls={filterPanelId}
            data-expanded={resolvedFilterExpanded ? 'true' : undefined}
            onClick={handleFilterClick}
          >
            <Icon name="filter" size="sm" hierarchy="tertiary" aria-hidden />
            <span>{t('common.filter', { defaultValue: 'Filter' })}</span>
            {selectedFilterCount > 0 ? (
              <span className="library-explorer-header__filter-count reference-explorer-header__filter-count">
                {selectedFilterCount}
              </span>
            ) : null}
          </button>
          <span
            className="library-explorer-header__divider reference-explorer-header__divider"
            aria-hidden
          />
        </div>

        <p className="library-explorer-header__count reference-explorer-header__count">
          {itemCountLabel}
        </p>

        <div
          className="library-explorer-header__actions reference-explorer-header__actions"
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

      {resolvedFilterExpanded ? (
        <div
          id={filterPanelId}
          className="library-explorer-filter-panel reference-explorer-filter-panel"
        >
          <CheckboxRow
            size="sm"
            label={t('references.filters.no_record', { defaultValue: 'no record' })}
            checked={resolvedNoRecordFilterSelected}
            onCheckedChange={handleNoRecordFilterChange}
            className="reference-explorer-filter-panel__checkbox"
          />
        </div>
      ) : null}
    </div>
  );
}

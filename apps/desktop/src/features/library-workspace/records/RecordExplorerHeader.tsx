import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChipButton, Icon, IconButton } from '../../../shared/ui';
import type { LibraryWorkspaceLayout } from '../common/types';
import type { RecordExplorerFilterGroup, RecordExplorerSelectedFilters } from './model/filterTypes';

type RecordExplorerHeaderProps = {
  itemCount: number;
  layout: LibraryWorkspaceLayout;
  filterExpanded?: boolean;
  filterGroups?: readonly RecordExplorerFilterGroup[];
  selectedFilters?: RecordExplorerSelectedFilters;
  onLayoutChange: (layout: LibraryWorkspaceLayout) => void;
  onFilterExpandedChange?: (expanded: boolean) => void;
  onFilterTagToggle?: (groupKey: string, tagId: string) => void;
};

function getSelectedFilterCount(selectedFilters: RecordExplorerSelectedFilters) {
  return Object.values(selectedFilters).reduce((count, tagIds) => count + tagIds.length, 0);
}

export function RecordExplorerHeader({
  itemCount,
  layout,
  filterExpanded = false,
  filterGroups = [],
  selectedFilters = {},
  onLayoutChange,
  onFilterExpandedChange,
  onFilterTagToggle,
}: RecordExplorerHeaderProps) {
  const { t } = useTranslation('common');
  const filterPanelId = useId();
  const selectedFilterCount = getSelectedFilterCount(selectedFilters);
  const recordCountLabel = t('records.count', {
    count: itemCount,
    formattedCount: itemCount.toLocaleString(),
    defaultValue: '{{formattedCount}} Records',
  });

  const handleFilterClick = () => {
    onFilterExpandedChange?.(!filterExpanded);
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
      className="library-explorer-header-shell record-explorer-header-shell"
      data-expanded={filterExpanded ? 'true' : 'false'}
    >
      <header className="library-explorer-header record-explorer-header">
        <div className="library-explorer-header__leading record-explorer-header__leading">
          <button
            type="button"
            className="library-explorer-header__filter record-explorer-header__filter"
            aria-expanded={filterExpanded}
            aria-controls={filterPanelId}
            data-expanded={filterExpanded ? 'true' : undefined}
            onClick={handleFilterClick}
          >
            <Icon name="filter" size="sm" hierarchy="tertiary" aria-hidden />
            <span>{t('common.filter', { defaultValue: 'Filter' })}</span>
            {selectedFilterCount > 0 ? (
              <span className="library-explorer-header__filter-count record-explorer-header__filter-count">
                {selectedFilterCount}
              </span>
            ) : null}
          </button>
          <span className="library-explorer-header__sort record-explorer-header__sort">
            <Icon name="sort-desc" size="sm" hierarchy="tertiary" aria-hidden />
            <span>{t('common.sort_newest', { defaultValue: 'Sort: Newest' })}</span>
          </span>
          <span
            className="library-explorer-header__divider record-explorer-header__divider"
            aria-hidden
          />
          <p className="library-explorer-header__count record-explorer-header__count">
            {recordCountLabel}
          </p>
        </div>

        <div
          className="library-explorer-header__actions record-explorer-header__actions"
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

      {filterExpanded ? (
        <div
          id={filterPanelId}
          className="library-explorer-filter-panel record-explorer-filter-panel"
        >
          {filterGroups.length > 0 ? (
            filterGroups.map(group => {
              const selectedTagIds = selectedFilters[group.key] ?? [];

              return (
                <div key={group.key} className="record-explorer-filter-panel__row">
                  <div className="record-explorer-filter-panel__label">{group.label}</div>
                  <div className="record-explorer-filter-panel__chips">
                    {group.tags.map(tag => {
                      const selected = selectedTagIds.includes(tag.id);

                      return (
                        <ChipButton
                          key={tag.id}
                          shape="pill"
                          variant={selected ? 'selected' : 'outline'}
                          pressed={selected}
                          onClick={() => {
                            onFilterTagToggle?.(group.key, tag.id);
                          }}
                        >
                          {tag.name}
                        </ChipButton>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="record-explorer-filter-panel__empty">
              {t('records.filters.empty', { defaultValue: 'No tag groups available.' })}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

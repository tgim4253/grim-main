import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../../shared/lib/cx';
import { Button, Checkbox } from '../../../shared/ui';

type SelectionToolbarProps = {
  selectionMode: boolean;
  selectedCount: number;
  totalCount: number;
  selectAllAriaLabel: string;
  actions?: ReactNode;
  className?: string;
  cancelDisabled?: boolean;
  selectDisabled?: boolean;
  selectAllDisabled?: boolean;
  onSelectionModeChange: (selectionMode: boolean) => void;
  onSelectAllChange: (selected: boolean) => void;
};

export function SelectionToolbar({
  selectionMode,
  selectedCount,
  totalCount,
  selectAllAriaLabel,
  actions = null,
  className,
  cancelDisabled = false,
  selectDisabled = false,
  selectAllDisabled = totalCount === 0,
  onSelectionModeChange,
  onSelectAllChange,
}: SelectionToolbarProps) {
  const { t } = useTranslation('common');
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const selectedLabel = t('common.selected_count', {
    count: selectedCount,
    formattedCount: selectedCount.toLocaleString(),
    defaultValue: '{{formattedCount}} selected',
  });
  const rootClassName = cx('library-selection-toolbar', className);

  if (!selectionMode) {
    return (
      <div className={rootClassName} data-selection="off">
        <Button
          size="sm"
          className="library-selection-toolbar__button"
          disabled={selectDisabled}
          onClick={() => {
            onSelectionModeChange(true);
          }}
        >
          {t('common.select', { defaultValue: 'Select' })}
        </Button>
      </div>
    );
  }

  return (
    <div className={rootClassName} data-selection="on">
      <div className="library-selection-toolbar__left">
        <Button
          size="sm"
          variant="secondary"
          className="library-selection-toolbar__button"
          disabled={cancelDisabled}
          onClick={() => {
            onSelectionModeChange(false);
          }}
        >
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <label className="library-selection-toolbar__select-all">
          <Checkbox
            size="sm"
            checked={allSelected}
            disabled={selectAllDisabled}
            aria-label={selectAllAriaLabel}
            onCheckedChange={onSelectAllChange}
          />
          <span>{t('common.select_all', { defaultValue: 'Select all' })}</span>
        </label>
        <span className="library-selection-toolbar__divider" aria-hidden />
        <span className="library-selection-toolbar__count">{selectedLabel}</span>
      </div>

      {actions ? <div className="library-selection-toolbar__actions">{actions}</div> : null}
    </div>
  );
}

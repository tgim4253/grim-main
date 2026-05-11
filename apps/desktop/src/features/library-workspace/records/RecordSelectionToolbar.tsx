import { useTranslation } from 'react-i18next';
import { Button, Checkbox } from '../../../shared/ui';

type RecordSelectionToolbarProps = {
  selectionMode: boolean;
  selectedCount: number;
  totalCount: number;
  actionBusy?: boolean;
  onSelectionModeChange: (selectionMode: boolean) => void;
  onSelectAllChange: (selected: boolean) => void;
  onDeleteSelected: () => void;
};

export function RecordSelectionToolbar({
  selectionMode,
  selectedCount,
  totalCount,
  actionBusy = false,
  onSelectionModeChange,
  onSelectAllChange,
  onDeleteSelected,
}: RecordSelectionToolbarProps) {
  const { t } = useTranslation('common');
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const selectedLabel = t('common.selected_count', {
    count: selectedCount,
    formattedCount: selectedCount.toLocaleString(),
    defaultValue: '{{formattedCount}} selected',
  });
  const selectedActionsDisabled = actionBusy || selectedCount === 0;

  if (!selectionMode) {
    return (
      <div className="record-selection-toolbar" data-selection="off">
        <Button
          size="sm"
          className="record-selection-toolbar__button"
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
    <div className="record-selection-toolbar" data-selection="on">
      <div className="record-selection-toolbar__left">
        <Button
          size="sm"
          variant="secondary"
          className="record-selection-toolbar__button"
          disabled={actionBusy}
          onClick={() => {
            onSelectionModeChange(false);
          }}
        >
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <label className="record-selection-toolbar__select-all">
          <Checkbox
            size="sm"
            checked={allSelected}
            disabled={actionBusy || totalCount === 0}
            aria-label={t('records.select_all_records', {
              defaultValue: 'Select all records',
            })}
            onCheckedChange={onSelectAllChange}
          />
          <span>{t('common.select_all', { defaultValue: 'Select all' })}</span>
        </label>
        <span className="record-selection-toolbar__divider" aria-hidden />
        <span className="record-selection-toolbar__count">{selectedLabel}</span>
      </div>

      <div className="record-selection-toolbar__actions">
        <Button size="sm" variant="secondary" disabled>
          {t('common.add_tag', { defaultValue: 'Add Tag' })}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={selectedActionsDisabled}
          onClick={onDeleteSelected}
        >
          {t('common.delete', { defaultValue: 'Delete' })}
        </Button>
        <Button size="sm" disabled>
          {t('common.export', { defaultValue: 'Export' })}
        </Button>
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui';
import { SelectionToolbar } from '../common/SelectionToolbar';

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
  const selectedActionsDisabled = actionBusy || selectedCount === 0;

  return (
    <SelectionToolbar
      className="record-selection-toolbar"
      selectionMode={selectionMode}
      selectedCount={selectedCount}
      totalCount={totalCount}
      cancelDisabled={actionBusy}
      selectAllDisabled={actionBusy || totalCount === 0}
      selectAllAriaLabel={t('records.select_all_records', {
        defaultValue: 'Select all records',
      })}
      onSelectionModeChange={onSelectionModeChange}
      onSelectAllChange={onSelectAllChange}
      actions={
        <>
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
        </>
      }
    />
  );
}

import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui';
import { SelectionToolbar } from '../common/SelectionToolbar';

type RecordSelectionToolbarProps = {
  selectionMode: boolean;
  selectedCount: number;
  totalCount: number;
  actionBusy?: boolean;
  addTagDisabled?: boolean;
  exportDisabled?: boolean;
  onSelectionModeChange: (selectionMode: boolean) => void;
  onSelectAllChange: (selected: boolean) => void;
  onDeleteSelected: () => void;
  onAddTag?: () => void;
  onExport?: () => void;
};

export function RecordSelectionToolbar({
  selectionMode,
  selectedCount,
  totalCount,
  actionBusy = false,
  addTagDisabled = false,
  exportDisabled,
  onSelectionModeChange,
  onSelectAllChange,
  onDeleteSelected,
  onAddTag,
  onExport,
}: RecordSelectionToolbarProps) {
  const { t } = useTranslation('common');
  const selectedActionsDisabled = actionBusy || selectedCount === 0;
  const resolvedExportDisabled = exportDisabled ?? selectedActionsDisabled;

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
          <Button size="sm" variant="secondary" disabled={addTagDisabled} onClick={onAddTag}>
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
          <Button size="sm" disabled={resolvedExportDisabled} onClick={onExport}>
            {t('common.export', { defaultValue: 'Export' })}
          </Button>
        </>
      }
    />
  );
}

import { useTranslation } from 'react-i18next';
import { Button, Checkbox } from '../../../shared/ui';

type ReferenceSelectionToolbarProps = {
  selectionMode: boolean;
  selectedCount: number;
  totalCount: number;
  croquisDisabled?: boolean;
  folderActionsDisabled?: boolean;
  onSelectionModeChange: (selectionMode: boolean) => void;
  onSelectAllChange: (selected: boolean) => void;
  onAddToFolder: () => void;
  onMoveToFolder: () => void;
  onStartCroquis: () => void;
};

export function ReferenceSelectionToolbar({
  selectionMode,
  selectedCount,
  totalCount,
  croquisDisabled = false,
  folderActionsDisabled = false,
  onSelectionModeChange,
  onSelectAllChange,
  onAddToFolder,
  onMoveToFolder,
  onStartCroquis,
}: ReferenceSelectionToolbarProps) {
  const { t } = useTranslation('common');
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const selectedLabel = t('common.selected_count', {
    count: selectedCount,
    formattedCount: selectedCount.toLocaleString(),
    defaultValue: '{{formattedCount}} selected',
  });
  const selectionActionsDisabled = folderActionsDisabled || selectedCount === 0;

  if (!selectionMode) {
    return (
      <div className="reference-selection-toolbar" data-selection="off">
        <Button
          size="sm"
          className="reference-selection-toolbar__button"
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
    <div className="reference-selection-toolbar" data-selection="on">
      <div className="reference-selection-toolbar__left">
        <Button
          size="sm"
          variant="secondary"
          className="reference-selection-toolbar__button"
          onClick={() => {
            onSelectionModeChange(false);
          }}
        >
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
        <label className="reference-selection-toolbar__select-all">
          <Checkbox
            size="sm"
            checked={allSelected}
            disabled={totalCount === 0}
            aria-label={t('references.select_all_assets', {
              defaultValue: 'Select all reference assets',
            })}
            onCheckedChange={onSelectAllChange}
          />
          <span>{t('common.select_all', { defaultValue: 'Select all' })}</span>
        </label>
        <span className="reference-selection-toolbar__divider" aria-hidden />
        <span className="reference-selection-toolbar__count">{selectedLabel}</span>
      </div>

      <div className="reference-selection-toolbar__actions">
        <Button
          size="sm"
          variant="secondary"
          disabled={selectionActionsDisabled}
          onClick={onAddToFolder}
        >
          {t('references.add_to_folder', { defaultValue: 'Add to Folder' })}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={selectionActionsDisabled}
          onClick={onMoveToFolder}
        >
          {t('common.move', { defaultValue: 'Move' })}
        </Button>
        <Button size="sm" variant="secondary" disabled>
          {t('common.delete', { defaultValue: 'Delete' })}
        </Button>
        <Button
          size="sm"
          className="reference-selection-toolbar__button"
          disabled={croquisDisabled || selectedCount === 0}
          onClick={onStartCroquis}
        >
          {t('common.croquis', { defaultValue: 'Croquis' })}
        </Button>
      </div>
    </div>
  );
}

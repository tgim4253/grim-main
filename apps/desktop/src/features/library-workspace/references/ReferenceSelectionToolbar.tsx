import { useTranslation } from 'react-i18next';
import { Button } from '../../../shared/ui';
import { SelectionToolbar } from '../common/SelectionToolbar';

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
  const selectionActionsDisabled = folderActionsDisabled || selectedCount === 0;

  return (
    <SelectionToolbar
      className="reference-selection-toolbar"
      selectionMode={selectionMode}
      selectedCount={selectedCount}
      totalCount={totalCount}
      selectAllAriaLabel={t('references.select_all_assets', {
        defaultValue: 'Select all reference assets',
      })}
      onSelectionModeChange={onSelectionModeChange}
      onSelectAllChange={onSelectAllChange}
      actions={
        <>
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
            disabled={croquisDisabled || selectedCount === 0}
            onClick={onStartCroquis}
          >
            {t('common.croquis', { defaultValue: 'Croquis' })}
          </Button>
        </>
      }
    />
  );
}

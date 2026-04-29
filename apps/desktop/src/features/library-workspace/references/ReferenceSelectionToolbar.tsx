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
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const selectedLabel = `${selectedCount.toLocaleString()} selected`;
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
          Select
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
          Cancel
        </Button>
        <label className="reference-selection-toolbar__select-all">
          <Checkbox
            size="sm"
            checked={allSelected}
            disabled={totalCount === 0}
            aria-label="Select all reference assets"
            onCheckedChange={onSelectAllChange}
          />
          <span>Select all</span>
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
          Add to Folder
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={selectionActionsDisabled}
          onClick={onMoveToFolder}
        >
          Move
        </Button>
        <Button size="sm" variant="secondary" disabled>
          Delete
        </Button>
        <Button
          size="sm"
          className="reference-selection-toolbar__button"
          disabled={croquisDisabled || selectedCount === 0}
          onClick={onStartCroquis}
        >
          Croquis
        </Button>
      </div>
    </div>
  );
}

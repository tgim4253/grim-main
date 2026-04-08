import { Button, Input } from '../../../../shared/ui';

type TagGroupEditorSectionProps = {
  busy: boolean;
  groupDraftId: string | null;
  groupName: string;
  onChangeGroupName: (value: string) => void;
  onDeleteGroup: () => void;
  onResetGroup: () => void;
  onSaveGroup: () => void;
};

export function TagGroupEditorSection({
  busy,
  groupDraftId,
  groupName,
  onChangeGroupName,
  onDeleteGroup,
  onResetGroup,
  onSaveGroup,
}: TagGroupEditorSectionProps) {
  return (
    <section className="library-viewer__section">
      <div className="library-manager__subheader">
        <div className="app-kicker">Tag Group</div>
        <Button variant="secondary" size="sm" onClick={onResetGroup}>
          Reset
        </Button>
      </div>

      <Input
        label="Group name"
        value={groupName}
        onChange={event => {
          onChangeGroupName(event.target.value);
        }}
        placeholder="Type / Genre / Study Mode"
      />

      <div className="library-inline-actions">
        <Button variant="primary" disabled={busy || !groupName.trim()} onClick={onSaveGroup}>
          {busy ? 'Saving...' : 'Save Group'}
        </Button>
        <Button variant="destructive" disabled={!groupDraftId} onClick={onDeleteGroup}>
          Delete Group
        </Button>
      </div>
    </section>
  );
}

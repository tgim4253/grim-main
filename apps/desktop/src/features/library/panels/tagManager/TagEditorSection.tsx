import { Button, Input } from '../../../../shared/ui';
import type { Tag, TagGroup } from '../../../../shared/types';

type TagEditorSectionProps = {
  busy: boolean;
  filteredTags: Tag[];
  tagDraftId: string | null;
  tagGroups: TagGroup[];
  tagColor: string;
  tagGroupId: string | null;
  tagName: string;
  onChangeTagColor: (value: string) => void;
  onChangeTagGroupId: (value: string | null) => void;
  onChangeTagName: (value: string) => void;
  onCreateTag: () => void;
  onDeleteTag: () => void;
  onSaveTag: () => void;
  onSelectTag: (tag: Tag) => void;
};

export function TagEditorSection({
  busy,
  filteredTags,
  tagDraftId,
  tagGroups,
  tagColor,
  tagGroupId,
  tagName,
  onChangeTagColor,
  onChangeTagGroupId,
  onChangeTagName,
  onCreateTag,
  onDeleteTag,
  onSaveTag,
  onSelectTag,
}: TagEditorSectionProps) {
  return (
    <section className="library-viewer__section">
      <div className="library-manager__subheader">
        <div className="app-kicker">Tag Editor</div>
        <Button variant="secondary" size="sm" onClick={onCreateTag}>
          New Tag
        </Button>
      </div>

      <div className="library-list">
        {filteredTags.length === 0 ? (
          <div className="library-empty-copy">No tags in this filter yet.</div>
        ) : (
          filteredTags.map(tag => (
            <button
              key={tag.id}
              type="button"
              className={`library-list__item${tag.id === tagDraftId ? ' library-list__item--active' : ''}`}
              onClick={() => {
                onSelectTag(tag);
              }}
            >
              <strong>{tag.name}</strong>
              <span>{tagGroups.find(group => group.id === tag.groupId)?.name ?? 'Ungrouped'}</span>
            </button>
          ))
        )}
      </div>

      <Input
        label="Tag name"
        value={tagName}
        onChange={event => {
          onChangeTagName(event.target.value);
        }}
        placeholder="gesture / anatomy / clothing"
      />

      <Input
        label="Tag color"
        value={tagColor}
        onChange={event => {
          onChangeTagColor(event.target.value);
        }}
        placeholder="#f59e0b"
      />

      <label className="library-field">
        <span className="library-field__label">Group</span>
        <select
          className="library-control"
          value={tagGroupId ?? ''}
          onChange={event => {
            onChangeTagGroupId(event.target.value || null);
          }}
        >
          <option value="">Ungrouped</option>
          {tagGroups.map(group => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>

      <div className="library-inline-actions">
        <Button variant="primary" disabled={busy || !tagName.trim()} onClick={onSaveTag}>
          {busy ? 'Saving...' : 'Save Tag'}
        </Button>
        <Button variant="destructive" disabled={!tagDraftId} onClick={onDeleteTag}>
          Delete Tag
        </Button>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { ipc } from '../../../shared/lib/ipc';
import type {
  DeleteTagGroupPayload,
  DeleteTagPayload,
  SaveTagGroupPayload,
  SaveTagPayload,
  Tag,
  TagGroup,
} from '../../../shared/types';
import { TagGroupEditorSection } from './tagManager/TagGroupEditorSection';
import { TagEditorSection } from './tagManager/TagEditorSection';
import { TagManagerSidebar } from './tagManager/TagManagerSidebar';
import { ALL_GROUP_FILTER, UNGROUPED_FILTER } from './tagManager/constants';

type TagManagerPanelProps = {
  refreshToken: number;
  tagGroups: TagGroup[];
  tags: Tag[];
  onDataChanged: () => Promise<void>;
};

export function TagManagerPanel({
  refreshToken: _refreshToken,
  tagGroups,
  tags,
  onDataChanged,
}: TagManagerPanelProps) {
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUP_FILTER);
  const [groupDraftId, setGroupDraftId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [tagDraftId, setTagDraftId] = useState<string | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('');
  const [tagGroupId, setTagGroupId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (groupDraftId && !tagGroups.some(group => group.id === groupDraftId)) {
      setGroupDraftId(null);
      setGroupName('');
    }

    if (tagDraftId && !tags.some(tag => tag.id === tagDraftId)) {
      setTagDraftId(null);
      setTagName('');
      setTagColor('');
      setTagGroupId(
        groupFilter === ALL_GROUP_FILTER || groupFilter === UNGROUPED_FILTER ? null : groupFilter,
      );
    }
  }, [groupDraftId, groupFilter, tagDraftId, tagGroups, tags]);

  const filteredTags = useMemo(() => {
    switch (groupFilter) {
      case ALL_GROUP_FILTER:
        return tags;
      case UNGROUPED_FILTER:
        return tags.filter(tag => !tag.groupId);
      default:
        return tags.filter(tag => tag.groupId === groupFilter);
    }
  }, [groupFilter, tags]);

  const handleSaveGroup = () => {
    const payload: SaveTagGroupPayload = {
      id: groupDraftId,
      name: groupName.trim(),
    };

    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await ipc.tag.saveGroup(payload);
        await onDataChanged();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to save tag group');
      } finally {
        setBusy(false);
      }
    })();
  };

  const handleDeleteGroup = () => {
    if (!groupDraftId) {
      return;
    }

    const payload: DeleteTagGroupPayload = { tagGroupId: groupDraftId };
    void (async () => {
      const shouldDelete = window.confirm(
        'Delete this tag group? Tags in the group will become ungrouped.',
      );
      if (!shouldDelete) {
        return;
      }

      setBusy(true);
      setError(null);
      try {
        await ipc.tag.deleteGroup(payload);
        setGroupDraftId(null);
        setGroupName('');
        setGroupFilter(ALL_GROUP_FILTER);
        await onDataChanged();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to delete tag group');
      } finally {
        setBusy(false);
      }
    })();
  };

  const handleSaveTag = () => {
    const payload: SaveTagPayload = {
      id: tagDraftId,
      groupId: tagGroupId,
      name: tagName.trim(),
      color: tagColor.trim() || null,
    };

    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await ipc.tag.saveTag(payload);
        await onDataChanged();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to save tag');
      } finally {
        setBusy(false);
      }
    })();
  };

  const handleDeleteTag = () => {
    if (!tagDraftId) {
      return;
    }

    const payload: DeleteTagPayload = { tagId: tagDraftId };
    void (async () => {
      const shouldDelete = window.confirm(
        'Delete this tag? It will be removed from assets, records, and presets.',
      );
      if (!shouldDelete) {
        return;
      }

      setBusy(true);
      setError(null);
      try {
        await ipc.tag.deleteTag(payload);
        setTagDraftId(null);
        setTagName('');
        setTagColor('');
        await onDataChanged();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to delete tag');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="library-manager">
      <TagManagerSidebar
        groupFilter={groupFilter}
        tagGroups={tagGroups}
        tags={tags}
        onCreateGroup={() => {
          setGroupDraftId(null);
          setGroupName('');
        }}
        onSelectGroupFilter={setGroupFilter}
        onSelectGroup={group => {
          setGroupFilter(group.id);
          setGroupDraftId(group.id);
          setGroupName(group.name);
        }}
      />

      <div className="library-manager__content">
        <div className="library-manager__split">
          <TagGroupEditorSection
            busy={busy}
            groupDraftId={groupDraftId}
            groupName={groupName}
            onChangeGroupName={setGroupName}
            onDeleteGroup={handleDeleteGroup}
            onResetGroup={() => {
              setGroupDraftId(null);
              setGroupName('');
            }}
            onSaveGroup={handleSaveGroup}
          />

          <TagEditorSection
            busy={busy}
            filteredTags={filteredTags}
            tagDraftId={tagDraftId}
            tagGroups={tagGroups}
            tagColor={tagColor}
            tagGroupId={tagGroupId}
            tagName={tagName}
            onChangeTagColor={setTagColor}
            onChangeTagGroupId={setTagGroupId}
            onChangeTagName={setTagName}
            onCreateTag={() => {
              setTagDraftId(null);
              setTagName('');
              setTagColor('');
              setTagGroupId(
                groupFilter === ALL_GROUP_FILTER || groupFilter === UNGROUPED_FILTER
                  ? null
                  : groupFilter,
              );
            }}
            onDeleteTag={handleDeleteTag}
            onSaveTag={handleSaveTag}
            onSelectTag={tag => {
              setTagDraftId(tag.id);
              setTagName(tag.name);
              setTagColor(tag.color ?? '');
              setTagGroupId(tag.groupId ?? null);
            }}
          />
        </div>

        {error ? <div className="library-inline-error">{error}</div> : null}
      </div>
    </div>
  );
}

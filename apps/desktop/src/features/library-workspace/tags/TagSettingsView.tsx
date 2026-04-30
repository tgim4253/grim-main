import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Button,
  ChipButton,
  Icon,
  Input,
  PreviewPanel,
  Select,
  type SelectOption,
} from '../../../shared/ui';
import { ipc } from '../../../shared/lib/ipc';
import type {
  SaveTagGroupPayload,
  SaveTagPayload,
  Tag,
  TagGroup,
  TagIndex,
} from '../../../shared/types';
import './tag-settings.css';

const UNGROUPED_GROUP_VALUE = '__ungrouped__';

type TagSettingsSelection =
  | {
      kind: 'group';
      id: string;
    }
  | {
      kind: 'tag';
      id: string;
    }
  | {
      kind: 'new-group';
    }
  | {
      kind: 'new-tag';
      groupId: string | null;
    };

type TagGroupView = {
  id: string | null;
  name: string;
  tags: Tag[];
  synthetic?: boolean;
};

type TagSettingsPreviewPanelProps = {
  tagIndex: TagIndex;
  selection: TagSettingsSelection;
  onClose: () => void;
  onSaveGroup: (payload: SaveTagGroupPayload) => Promise<void>;
  onSaveTag: (payload: SaveTagPayload) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
};

const EMPTY_TAG_INDEX: TagIndex = {
  groups: [],
  tags: [],
};

function compareBySortOrderThenName(
  first: Pick<Tag | TagGroup, 'name' | 'sortOrder'>,
  second: Pick<Tag | TagGroup, 'name' | 'sortOrder'>,
) {
  if (first.sortOrder !== second.sortOrder) {
    return first.sortOrder - second.sortOrder;
  }

  return first.name.localeCompare(second.name);
}

function normalizeName(value: string) {
  return value.trim();
}

function parseSortOrder(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue)) {
    return undefined;
  }

  return Math.trunc(parsedValue);
}

function getNextGroupSortOrder(groups: readonly TagGroup[]) {
  if (groups.length === 0) {
    return 0;
  }

  return Math.max(...groups.map(group => group.sortOrder)) + 10;
}

function getNextTagSortOrder(tags: readonly Tag[], groupId: string | null) {
  const siblingSortOrders = tags
    .filter(tag => (tag.groupId ?? null) === groupId)
    .map(tag => tag.sortOrder);

  if (siblingSortOrders.length === 0) {
    return 0;
  }

  return Math.max(...siblingSortOrders) + 10;
}

function getSelectionKey(selection: TagSettingsSelection) {
  if (selection.kind === 'new-group') {
    return 'new-group';
  }

  if (selection.kind === 'new-tag') {
    return `new-tag:${selection.groupId ?? UNGROUPED_GROUP_VALUE}`;
  }

  return `${selection.kind}:${selection.id}`;
}

function getGroupedTags(tagIndex: TagIndex): TagGroupView[] {
  const groupedTags = new Map<string | null, Tag[]>();

  for (const tag of tagIndex.tags) {
    const groupId = tag.groupId ?? null;
    const tags = groupedTags.get(groupId) ?? [];
    tags.push(tag);
    groupedTags.set(groupId, tags);
  }

  const groups = [...tagIndex.groups].sort(compareBySortOrderThenName).map<TagGroupView>(group => ({
    id: group.id,
    name: group.name,
    tags: [...(groupedTags.get(group.id) ?? [])].sort(compareBySortOrderThenName),
  }));

  const ungroupedTags = [...(groupedTags.get(null) ?? [])].sort(compareBySortOrderThenName);
  if (ungroupedTags.length > 0) {
    groups.push({
      id: null,
      name: 'Ungrouped',
      tags: ungroupedTags,
      synthetic: true,
    });
  }

  return groups;
}

function formatTagCount(tagCount: number) {
  return `${tagCount.toLocaleString()} TAGS`;
}

function getPanelTitle(selection: TagSettingsSelection) {
  if (selection.kind === 'group' || selection.kind === 'new-group') {
    return selection.kind === 'new-group' ? 'New Group' : 'Tag Group';
  }

  return selection.kind === 'new-tag' ? 'New Tag' : 'Tag Detail';
}

function TagSettingsState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="tag-settings-state">
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="tag-settings-state__action">{action}</div> : null}
    </div>
  );
}

function TagSettingsPreviewPanel({
  tagIndex,
  selection,
  onClose,
  onSaveGroup,
  onSaveTag,
  onDeleteGroup,
  onDeleteTag,
}: TagSettingsPreviewPanelProps) {
  const selectionKey = getSelectionKey(selection);
  const selectedGroup =
    selection.kind === 'group'
      ? (tagIndex.groups.find(group => group.id === selection.id) ?? null)
      : null;
  const selectedTag =
    selection.kind === 'tag' ? (tagIndex.tags.find(tag => tag.id === selection.id) ?? null) : null;
  const isGroupForm = selection.kind === 'group' || selection.kind === 'new-group';
  const groupOptions = useMemo<SelectOption[]>(
    () => [
      {
        value: UNGROUPED_GROUP_VALUE,
        label: 'Ungrouped',
      },
      ...[...tagIndex.groups].sort(compareBySortOrderThenName).map(group => ({
        value: group.id,
        label: group.name,
      })),
    ],
    [tagIndex.groups],
  );
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string>(UNGROUPED_GROUP_VALUE);
  const [color, setColor] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteConfirmationPending, setDeleteConfirmationPending] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setErrorMessage(null);
    setDeleteConfirmationPending(false);

    if (selection.kind === 'group') {
      setName(selectedGroup?.name ?? '');
      setSortOrder(String(selectedGroup?.sortOrder ?? 0));
      setGroupId(UNGROUPED_GROUP_VALUE);
      setColor('');
      return;
    }

    if (selection.kind === 'new-group') {
      setName('');
      setSortOrder(String(getNextGroupSortOrder(tagIndex.groups)));
      setGroupId(UNGROUPED_GROUP_VALUE);
      setColor('');
      return;
    }

    if (selection.kind === 'tag') {
      setName(selectedTag?.name ?? '');
      setSortOrder(String(selectedTag?.sortOrder ?? 0));
      setGroupId(selectedTag?.groupId ?? UNGROUPED_GROUP_VALUE);
      setColor(selectedTag?.color ?? '');
      return;
    }

    setName('');
    setSortOrder(String(getNextTagSortOrder(tagIndex.tags, selection.groupId)));
    setGroupId(selection.groupId ?? UNGROUPED_GROUP_VALUE);
    setColor('');
  }, [selection, selectionKey, selectedGroup, selectedTag, tagIndex.groups, tagIndex.tags]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = normalizeName(name);
    if (!trimmedName) {
      setErrorMessage(isGroupForm ? 'Group name is required.' : 'Tag name is required.');
      return;
    }

    const parsedSortOrder = parseSortOrder(sortOrder);
    if (parsedSortOrder === undefined) {
      setErrorMessage('Sort order must be a number.');
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    try {
      if (isGroupForm) {
        await onSaveGroup({
          id: selection.kind === 'group' ? selection.id : null,
          name: trimmedName,
          sortOrder: parsedSortOrder,
        });
        return;
      }

      await onSaveTag({
        id: selection.kind === 'tag' ? selection.id : null,
        groupId: groupId === UNGROUPED_GROUP_VALUE ? null : groupId,
        name: trimmedName,
        color: color.trim() || null,
        sortOrder: parsedSortOrder,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save tag settings.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (selection.kind !== 'group' && selection.kind !== 'tag') {
      return;
    }

    if (!deleteConfirmationPending) {
      setDeleteConfirmationPending(true);
      setErrorMessage(
        selection.kind === 'group'
          ? 'Click Confirm Delete to delete this group. Tags in the group will be moved to Ungrouped.'
          : 'Click Confirm Delete to permanently delete this tag. Tags already used by records or session steps cannot be deleted.',
      );
      return;
    }

    setBusy(true);
    setErrorMessage(null);

    try {
      if (selection.kind === 'group') {
        await onDeleteGroup(selection.id);
      } else {
        await onDeleteTag(selection.id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to delete tag settings.');
    } finally {
      setBusy(false);
    }
  };

  const deleteDisabled = busy || selection.kind === 'new-group' || selection.kind === 'new-tag';
  const deleteButtonLabel = deleteConfirmationPending ? 'Confirm Delete' : 'Delete';

  return (
    <PreviewPanel
      title={getPanelTitle(selection)}
      ariaLabel="Tag settings detail"
      className="tag-settings-preview"
      onClose={onClose}
    >
      <form
        className="tag-settings-preview__form"
        onSubmit={event => {
          void handleSubmit(event);
        }}
      >
        <section className="tag-settings-preview__section">
          <div className="tag-settings-preview__section-heading">
            <span className="tag-settings-preview__section-marker" aria-hidden />
            <h3>{isGroupForm ? 'Group Metadata' : 'Tag Metadata'}</h3>
          </div>

          <div className="tag-settings-preview__fields">
            <Input
              label={isGroupForm ? 'Group Name' : 'Tag Name'}
              value={name}
              placeholder={isGroupForm ? 'Purpose' : 'Pose'}
              disabled={busy}
              onChange={event => {
                setName(event.target.value);
              }}
            />

            {!isGroupForm ? (
              <Select
                label="Group"
                value={groupId}
                options={groupOptions}
                disabled={busy}
                onValueChange={setGroupId}
              />
            ) : null}

            {!isGroupForm ? (
              <Input
                label="Color"
                value={color}
                placeholder="#26997b"
                disabled={busy}
                onChange={event => {
                  setColor(event.target.value);
                }}
              />
            ) : null}

            <Input
              label="Sort Order"
              type="number"
              step={1}
              value={sortOrder}
              disabled={busy}
              onChange={event => {
                setSortOrder(event.target.value);
              }}
            />
          </div>
        </section>

        {errorMessage ? <p className="tag-settings-preview__error">{errorMessage}</p> : null}

        <div className="tag-settings-preview__actions">
          <Button type="submit" size="sm" disabled={busy}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={deleteDisabled}
            onClick={() => {
              void handleDelete();
            }}
          >
            {deleteButtonLabel}
          </Button>
        </div>
      </form>
    </PreviewPanel>
  );
}

export function TagSettingsView() {
  const [tagIndex, setTagIndex] = useState<TagIndex>(EMPTY_TAG_INDEX);
  const [selection, setSelection] = useState<TagSettingsSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const groupedTags = useMemo(() => getGroupedTags(tagIndex), [tagIndex]);

  const loadTagIndex = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      setTagIndex(await ipc.tag.loadIndex());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load tag settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTagIndex();
  }, [loadTagIndex]);

  useEffect(() => {
    if (!selection) {
      return;
    }

    if (selection.kind === 'group' && !tagIndex.groups.some(group => group.id === selection.id)) {
      setSelection(null);
      return;
    }

    if (selection.kind === 'tag' && !tagIndex.tags.some(tag => tag.id === selection.id)) {
      setSelection(null);
    }
  }, [selection, tagIndex.groups, tagIndex.tags]);

  const handleSaveGroup = useCallback(async (payload: SaveTagGroupPayload) => {
    const nextIndex = await ipc.tag.saveGroup(payload);
    setTagIndex(nextIndex);

    const savedGroup = payload.id
      ? nextIndex.groups.find(group => group.id === payload.id)
      : nextIndex.groups.find(group => group.name === payload.name);

    if (savedGroup) {
      setSelection({ kind: 'group', id: savedGroup.id });
    }
  }, []);

  const handleSaveTag = useCallback(async (payload: SaveTagPayload) => {
    const nextIndex = await ipc.tag.saveTag(payload);
    setTagIndex(nextIndex);

    const savedTag = payload.id
      ? nextIndex.tags.find(tag => tag.id === payload.id)
      : nextIndex.tags.find(
          tag => tag.name === payload.name && (tag.groupId ?? null) === (payload.groupId ?? null),
        );

    if (savedTag) {
      setSelection({ kind: 'tag', id: savedTag.id });
    }
  }, []);

  const handleDeleteGroup = useCallback(async (groupId: string) => {
    setTagIndex(await ipc.tag.deleteGroup({ tagGroupId: groupId }));
    setSelection(null);
  }, []);

  const handleDeleteTag = useCallback(async (tagId: string) => {
    setTagIndex(await ipc.tag.deleteTag({ tagId }));
    setSelection(null);
  }, []);

  const selectedTagId = selection?.kind === 'tag' ? selection.id : null;
  const selectedGroupId = selection?.kind === 'group' ? selection.id : null;

  return (
    <section className="tag-settings-view" aria-label="Tag settings">
      <div className="tag-settings-view__main">
        <header className="tag-settings-header">
          <div className="tag-settings-header__leading">
            <h2>Tag Settings</h2>
            <span className="tag-settings-header__count">
              {formatTagCount(tagIndex.tags.length)}
            </span>
          </div>

          <div className="tag-settings-header__actions">
            <Button size="sm" variant="ghost" disabled>
              <Icon name="filter" size="sm" hierarchy="tertiary" aria-hidden />
              Filter
            </Button>
            <Button size="sm" variant="ghost" disabled>
              Sort
            </Button>
            <Button size="sm" variant="secondary" disabled>
              Manage Groups
            </Button>
          </div>
        </header>

        <div className="tag-settings-view__body">
          {loading ? (
            <TagSettingsState
              title="Loading tags"
              description="Tag groups and tags are being loaded."
            />
          ) : errorMessage ? (
            <TagSettingsState
              title="Failed to load tags"
              description={errorMessage}
              action={
                <Button size="sm" variant="secondary" onClick={() => void loadTagIndex()}>
                  Retry
                </Button>
              }
            />
          ) : (
            <div className="tag-settings-groups" aria-label="Tag groups">
              {groupedTags.map(group => (
                <section key={group.id ?? UNGROUPED_GROUP_VALUE} className="tag-settings-group">
                  <div className="tag-settings-group__header">
                    {group.synthetic ? (
                      <div className="tag-settings-group__title tag-settings-group__title--static">
                        <span>{group.name}</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="tag-settings-group__title"
                        data-active={selectedGroupId === group.id ? 'true' : undefined}
                        onClick={() => {
                          if (group.id) {
                            setSelection({ kind: 'group', id: group.id });
                          }
                        }}
                      >
                        <span>{group.name}</span>
                      </button>
                    )}
                    <span className="tag-settings-group__count">{group.tags.length}</span>
                  </div>

                  <div className="tag-settings-group__chips">
                    {group.tags.map(tag => (
                      <ChipButton
                        key={tag.id}
                        shape="pill"
                        variant="outline"
                        pressed={selectedTagId === tag.id}
                        onClick={() => {
                          setSelection({ kind: 'tag', id: tag.id });
                        }}
                      >
                        {tag.name}
                      </ChipButton>
                    ))}
                    <ChipButton
                      shape="rounded"
                      variant="add"
                      onClick={() => {
                        setSelection({ kind: 'new-tag', groupId: group.id });
                      }}
                    >
                      New tag
                    </ChipButton>
                  </div>
                </section>
              ))}

              <Button
                size="sm"
                variant="secondary"
                className="tag-settings-groups__add"
                onClick={() => {
                  setSelection({ kind: 'new-group' });
                }}
              >
                Add Group
              </Button>
            </div>
          )}
        </div>
      </div>

      {selection ? (
        <div className="tag-settings-view__preview-shell">
          <TagSettingsPreviewPanel
            tagIndex={tagIndex}
            selection={selection}
            onClose={() => {
              setSelection(null);
            }}
            onSaveGroup={handleSaveGroup}
            onSaveTag={handleSaveTag}
            onDeleteGroup={handleDeleteGroup}
            onDeleteTag={handleDeleteTag}
          />
        </div>
      ) : null}
    </section>
  );
}

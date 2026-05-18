import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useKeybindings } from '@/shared/hooks';
import type { SaveTagGroupPayload, SaveTagPayload, TagIndex } from '@/shared/types';
import { Button, Input, PreviewPanel, Select, type SelectOption } from '@/shared/ui';
import {
  UNGROUPED_GROUP_VALUE,
  compareBySortOrderThenName,
  getNextGroupSortOrder,
  getNextTagSortOrder,
  getPanelTitle,
  getSelectionKey,
  normalizeName,
  parseSortOrder,
  type TagSettingsSelection,
} from '../model/tagSettingsModel';

type TagSettingsPreviewPanelProps = {
  tagIndex: TagIndex;
  selection: TagSettingsSelection;
  onClose: () => void;
  onSaveGroup: (payload: SaveTagGroupPayload) => Promise<void>;
  onSaveTag: (payload: SaveTagPayload) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
  onDeleteTag: (tagId: string) => Promise<void>;
  shortcutsDisabled?: boolean;
};

export function TagSettingsPreviewPanel({
  tagIndex,
  selection,
  onClose,
  onSaveGroup,
  onSaveTag,
  onDeleteGroup,
  onDeleteTag,
  shortcutsDisabled = false,
}: TagSettingsPreviewPanelProps) {
  const { t } = useTranslation('common');
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
        label: t('tags.ungrouped', { defaultValue: 'Ungrouped' }),
      },
      ...[...tagIndex.groups].sort(compareBySortOrderThenName).map(group => ({
        value: group.id,
        label: group.name,
      })),
    ],
    [t, tagIndex.groups],
  );
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string>(UNGROUPED_GROUP_VALUE);
  const [color, setColor] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteConfirmationPending, setDeleteConfirmationPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

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
      setErrorMessage(
        isGroupForm
          ? t('tags.error.group_name_required', { defaultValue: 'Group name is required.' })
          : t('tags.error.tag_name_required', { defaultValue: 'Tag name is required.' }),
      );
      return;
    }

    const parsedSortOrder = parseSortOrder(sortOrder);
    if (parsedSortOrder === undefined) {
      setErrorMessage(
        t('tags.error.sort_order_number', { defaultValue: 'Sort order must be a number.' }),
      );
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
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('tags.error.save_settings', { defaultValue: 'Failed to save tag settings.' }),
      );
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
          ? t('tags.confirm_delete_group_help', {
              defaultValue:
                'Click Confirm Delete to delete this group. Tags in the group will be moved to Ungrouped.',
            })
          : t('tags.confirm_delete_tag_help', {
              defaultValue:
                'Click Confirm Delete to permanently delete this tag. Tags already used by records or session steps cannot be deleted.',
            }),
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
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('tags.error.delete_settings', { defaultValue: 'Failed to delete tag settings.' }),
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteDisabled = busy || selection.kind === 'new-group' || selection.kind === 'new-tag';
  const deleteButtonLabel = deleteConfirmationPending
    ? t('common.confirm_delete', { defaultValue: 'Confirm Delete' })
    : t('common.delete', { defaultValue: 'Delete' });
  const initialName =
    selection.kind === 'group'
      ? (selectedGroup?.name ?? '')
      : selection.kind === 'tag'
        ? (selectedTag?.name ?? '')
        : '';
  const initialGroupId =
    selection.kind === 'tag' ? (selectedTag?.groupId ?? UNGROUPED_GROUP_VALUE) : groupId;
  const initialColor = selection.kind === 'tag' ? (selectedTag?.color ?? '') : '';
  const initialSortOrder =
    selection.kind === 'group'
      ? String(selectedGroup?.sortOrder ?? 0)
      : selection.kind === 'tag'
        ? String(selectedTag?.sortOrder ?? 0)
        : sortOrder;
  const dirty =
    selection.kind === 'new-group' ||
    selection.kind === 'new-tag' ||
    name !== initialName ||
    groupId !== initialGroupId ||
    color !== initialColor ||
    sortOrder !== initialSortOrder;

  useKeybindings({
    context: {
      dirty,
      editing: true,
      inputFocus: false,
      itemSelected: selection.kind === 'group' || selection.kind === 'tag',
      libraryPage: true,
      tagSettingsView: true,
    },
    enabled: !shortcutsDisabled,
    handlers: {
      'grim.tags.cancelEdit': onClose,
      'grim.tags.commitEdit': () => {
        formRef.current?.requestSubmit();
      },
      'grim.tags.delete': () => {
        void handleDelete();
      },
      'grim.tags.save': () => {
        formRef.current?.requestSubmit();
      },
    },
  });

  return (
    <PreviewPanel
      title={getPanelTitle(selection, t)}
      ariaLabel={t('tags.settings_detail', { defaultValue: 'Tag settings detail' })}
      className="tag-settings-preview"
      onClose={onClose}
    >
      <form
        ref={formRef}
        className="tag-settings-preview__form"
        onSubmit={event => {
          void handleSubmit(event);
        }}
      >
        <section className="tag-settings-preview__section">
          <div className="tag-settings-preview__section-heading">
            <span className="tag-settings-preview__section-marker" aria-hidden />
            <h3>
              {isGroupForm
                ? t('tags.group_metadata', { defaultValue: 'Group Metadata' })
                : t('tags.tag_metadata', { defaultValue: 'Tag Metadata' })}
            </h3>
          </div>

          <div className="tag-settings-preview__fields">
            <Input
              label={
                isGroupForm
                  ? t('tags.group_name', { defaultValue: 'Group Name' })
                  : t('tags.tag_name', { defaultValue: 'Tag Name' })
              }
              value={name}
              placeholder={
                isGroupForm
                  ? t('tags.placeholder.purpose', { defaultValue: 'Purpose' })
                  : t('tags.placeholder.pose', { defaultValue: 'Pose' })
              }
              disabled={busy}
              onChange={event => {
                setName(event.target.value);
              }}
            />

            {!isGroupForm ? (
              <Select
                label={t('tags.group', { defaultValue: 'Group' })}
                value={groupId}
                options={groupOptions}
                disabled={busy}
                onValueChange={setGroupId}
              />
            ) : null}

            {!isGroupForm ? (
              <Input
                label={t('tags.color', { defaultValue: 'Color' })}
                value={color}
                placeholder="#26997b"
                disabled={busy}
                onChange={event => {
                  setColor(event.target.value);
                }}
              />
            ) : null}

            <Input
              label={t('tags.sort_order', { defaultValue: 'Sort Order' })}
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
            {t('common.save', { defaultValue: 'Save' })}
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

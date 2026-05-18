import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useKeybindings } from '@/shared/hooks';
import { Button, ChipButton, Icon } from '../../../shared/ui';
import { ipc } from '../../../shared/lib/ipc';
import type { SaveTagGroupPayload, SaveTagPayload, TagIndex } from '../../../shared/types';
import {
  EMPTY_TAG_INDEX,
  UNGROUPED_GROUP_VALUE,
  formatTagCount,
  getGroupedTags,
  type TagSettingsSelection,
} from './model/tagSettingsModel';
import { TagSettingsPreviewPanel } from './ui/TagSettingsPreviewPanel';
import { TagSettingsState } from './ui/TagSettingsState';
import './tag-settings.css';

type TagSettingsViewProps = {
  modalOpen?: boolean;
};

export function TagSettingsView({ modalOpen = false }: TagSettingsViewProps) {
  const { t } = useTranslation('common');
  const [tagIndex, setTagIndex] = useState<TagIndex>(EMPTY_TAG_INDEX);
  const [selection, setSelection] = useState<TagSettingsSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const groupedTags = useMemo(() => getGroupedTags(tagIndex, t), [tagIndex, t]);

  const loadTagIndex = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      setTagIndex(await ipc.tag.loadIndex());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t('tags.error.load_settings', { defaultValue: 'Failed to load tag settings.' }),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

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
  const itemSelected = selection?.kind === 'group' || selection?.kind === 'tag';

  useKeybindings({
    context: {
      groupSelected: Boolean(selectedGroupId),
      inputFocus: false,
      itemSelected,
      libraryPage: true,
      modalOpen,
      tagSettingsView: true,
    },
    enabled: !modalOpen,
    handlers: {
      'grim.tags.group.new': () => {
        setSelection({ kind: 'new-group' });
      },
      'grim.tags.rename': () => {
        if (!itemSelected) {
          return;
        }

        document
          .querySelector<HTMLInputElement>('.tag-settings-preview input:not([disabled])')
          ?.focus();
      },
      'grim.tags.tag.new': () => {
        if (!selectedGroupId) {
          return;
        }

        setSelection({ kind: 'new-tag', groupId: selectedGroupId });
      },
    },
  });

  return (
    <section
      className="tag-settings-view"
      aria-label={t('tags.settings.aria_label', { defaultValue: 'Tag settings' })}
    >
      <div className="tag-settings-view__main">
        <header className="tag-settings-header">
          <div className="tag-settings-header__leading">
            <h2>{t('tags.settings.title', { defaultValue: 'Tag Settings' })}</h2>
            <span className="tag-settings-header__count">
              {formatTagCount(tagIndex.tags.length, t)}
            </span>
          </div>

          <div className="tag-settings-header__actions">
            <Button size="sm" variant="ghost" disabled>
              <Icon name="filter" size="sm" hierarchy="tertiary" aria-hidden />
              {t('common.filter', { defaultValue: 'Filter' })}
            </Button>
            <Button size="sm" variant="ghost" disabled>
              {t('common.sort', { defaultValue: 'Sort' })}
            </Button>
            <Button size="sm" variant="secondary" disabled>
              {t('tags.manage_groups', { defaultValue: 'Manage Groups' })}
            </Button>
          </div>
        </header>

        <div className="tag-settings-view__body">
          {loading ? (
            <TagSettingsState
              title={t('tags.loading', { defaultValue: 'Loading tags' })}
              description={t('tags.loading_description', {
                defaultValue: 'Tag groups and tags are being loaded.',
              })}
            />
          ) : errorMessage ? (
            <TagSettingsState
              title={t('tags.failed_to_load', { defaultValue: 'Failed to load tags' })}
              description={errorMessage}
              action={
                <Button size="sm" variant="secondary" onClick={() => void loadTagIndex()}>
                  {t('common.retry', { defaultValue: 'Retry' })}
                </Button>
              }
            />
          ) : (
            <div
              className="tag-settings-groups"
              aria-label={t('tags.groups', { defaultValue: 'Tag groups' })}
            >
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
                      {t('tags.new_tag_lower', { defaultValue: 'New tag' })}
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
                {t('tags.add_group', { defaultValue: 'Add Group' })}
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
            shortcutsDisabled={modalOpen}
          />
        </div>
      ) : null}
    </section>
  );
}

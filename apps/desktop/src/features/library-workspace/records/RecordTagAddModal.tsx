import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, ModalFooter } from '../../../shared/ui';
import type { Tag, TagGroup } from '../../../shared/types';
import { TagSearchSelect } from '../../library/components';

type RecordTagAddModalProps = {
  open: boolean;
  tags: readonly Tag[];
  tagGroups?: readonly TagGroup[];
  disabled?: boolean;
  title?: string;
  emptyMessage?: string;
  onClose: () => void;
  onAddTag: (tag: Tag) => Promise<void> | void;
};

export function RecordTagAddModal({
  open,
  tags,
  tagGroups = [],
  disabled = false,
  title,
  emptyMessage,
  onClose,
  onAddTag,
}: RecordTagAddModalProps) {
  const { t } = useTranslation('common');
  const [selectedTagId, setSelectedTagId] = useState('');
  const selectedTag = useMemo(
    () => tags.find(tag => tag.id === selectedTagId) ?? null,
    [selectedTagId, tags],
  );
  const resolvedTitle =
    title ??
    t('common.add_label', {
      label: t('tags.tag', { defaultValue: 'Tag' }),
      defaultValue: 'Add {{label}}',
    });
  const resolvedEmptyMessage =
    emptyMessage ?? t('tags.no_tags_found', { defaultValue: 'No tags found' });

  useEffect(() => {
    if (!open) {
      setSelectedTagId('');
    }
  }, [open]);

  useEffect(() => {
    if (selectedTagId && !tags.some(tag => tag.id === selectedTagId)) {
      setSelectedTagId('');
    }
  }, [selectedTagId, tags]);

  const handleClose = () => {
    setSelectedTagId('');
    onClose();
  };

  const handleAddTag = () => {
    if (disabled || selectedTag === null) {
      return;
    }

    void Promise.resolve(onAddTag(selectedTag))
      .then(() => {
        handleClose();
      })
      .catch(() => {
        // Error display is owned by the parent records view.
      });
  };

  return (
    <Modal
      open={open}
      size="sm"
      title={resolvedTitle}
      onClose={handleClose}
      dialogClassName="record-tag-add-modal"
      bodyClassName="record-tag-add-modal__body"
      footer={
        <ModalFooter alignment="end">
          <Button size="sm" variant="secondary" disabled={disabled} onClick={handleClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button size="sm" disabled={disabled || selectedTag === null} onClick={handleAddTag}>
            {t('common.add_tag', { defaultValue: 'Add Tag' })}
          </Button>
        </ModalFooter>
      }
    >
      <TagSearchSelect
        tags={tags}
        groups={tagGroups}
        value={selectedTagId}
        placeholder={t('tags.search_existing', { defaultValue: 'Search existing tags' })}
        emptyMessage={resolvedEmptyMessage}
        disabled={disabled || tags.length === 0}
        aria-label={t('common.search_label', {
          label: t('tags.tag', { defaultValue: 'Tag' }),
          defaultValue: 'Search {{label}}',
        })}
        onValueChange={nextTagId => {
          setSelectedTagId(nextTagId);
        }}
      />
      <span className="record-result-preview__tag-hint">
        {t('croquis.auto_tags.existing_only_hint', {
          defaultValue: 'Existing tags only. Use Tag Settings to create or edit tags.',
        })}
      </span>
    </Modal>
  );
}

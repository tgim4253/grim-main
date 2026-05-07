import { useEffect, useMemo, useState } from 'react';
import { Button, Chip, ChipButton, Modal, ModalFooter } from '../../../shared/ui';
import type { Tag, TagGroup } from '../../../shared/types';
import { TagSearchSelect } from '../../library/components';
import './session-preset-step-editor.css';

type AutoTagPickerProps = {
  label: string;
  tags: readonly Tag[];
  availableTags: readonly Tag[];
  tagGroups?: readonly TagGroup[];
  disabled?: boolean;
  emptyLabel?: string;
  onTagAdd?: (tag: Tag) => void;
  onTagRemove?: (tagId: string) => void;
};

export function AutoTagPicker({
  label,
  tags,
  availableTags,
  tagGroups = [],
  disabled = false,
  emptyLabel = 'No auto tags',
  onTagAdd,
  onTagRemove,
}: AutoTagPickerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState('');
  const canEditTags = Boolean(onTagAdd && onTagRemove);
  const linkedTagIds = useMemo(() => new Set(tags.map(tag => tag.id)), [tags]);
  const selectableTags = useMemo(
    () => availableTags.filter(tag => !linkedTagIds.has(tag.id)),
    [availableTags, linkedTagIds],
  );
  const selectedTag = useMemo(
    () => selectableTags.find(tag => tag.id === selectedTagId) ?? null,
    [selectableTags, selectedTagId],
  );
  const tagEmptyMessage =
    availableTags.length > 0 && selectableTags.length === 0
      ? 'All tags are linked'
      : 'No tags found';

  useEffect(() => {
    if (selectedTagId && !selectableTags.some(tag => tag.id === selectedTagId)) {
      setSelectedTagId('');
    }
  }, [selectableTags, selectedTagId]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      setIsModalOpen(false);
      setSelectedTagId('');
    };

    window.addEventListener('keydown', handleEscape, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleEscape, { capture: true });
    };
  }, [isModalOpen]);

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedTagId('');
  };

  const handleAddTag = () => {
    if (disabled || !selectedTag || !onTagAdd) {
      return;
    }

    onTagAdd(selectedTag);
    handleModalClose();
  };

  return (
    <section className="session-preset-step-editor__group">
      <span className="session-preset-step-editor__label">{label}</span>
      <div className="session-preset-step-editor__tag-row">
        {tags.map(tag =>
          canEditTags ? (
            <ChipButton
              key={tag.id}
              shape="rounded"
              variant="neutral-dismiss"
              disabled={disabled}
              aria-label={`Remove tag ${tag.name}`}
              onClick={() => {
                onTagRemove?.(tag.id);
              }}
            >
              {tag.name}
            </ChipButton>
          ) : (
            <Chip key={tag.id} shape="rounded" variant="accent-outline">
              {tag.name}
            </Chip>
          ),
        )}
        {tags.length === 0 ? (
          <Chip shape="rounded" variant="accent-outline">
            {emptyLabel}
          </Chip>
        ) : null}
        {canEditTags ? (
          <ChipButton
            shape="rounded"
            variant="add"
            disabled={disabled || selectableTags.length === 0}
            aria-label={`Add ${label}`}
            onClick={() => {
              setIsModalOpen(true);
            }}
          >
            Tag
          </ChipButton>
        ) : null}
      </div>
      {canEditTags && availableTags.length === 0 ? (
        <span className="session-preset-step-editor__tag-hint">
          Create tags in Tag Settings first.
        </span>
      ) : null}
      <Modal
        open={isModalOpen}
        size="sm"
        title={`Add ${label}`}
        onClose={handleModalClose}
        closeOnEscape={false}
        dialogClassName="session-preset-step-editor__tag-modal"
        bodyClassName="session-preset-step-editor__tag-modal-body"
        footer={
          <ModalFooter alignment="end">
            <Button size="sm" variant="secondary" onClick={handleModalClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={disabled || selectedTag === null} onClick={handleAddTag}>
              Add Tag
            </Button>
          </ModalFooter>
        }
      >
        <TagSearchSelect
          tags={selectableTags}
          groups={tagGroups}
          value={selectedTagId}
          placeholder="Search existing tags"
          emptyMessage={tagEmptyMessage}
          disabled={disabled || availableTags.length === 0}
          aria-label={`Search ${label}`}
          onValueChange={nextTagId => {
            setSelectedTagId(nextTagId);
          }}
        />
        <span className="session-preset-step-editor__tag-hint">
          Existing tags only. Use Tag Settings to create or edit tags.
        </span>
      </Modal>
    </section>
  );
}

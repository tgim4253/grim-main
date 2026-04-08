import { useCallback, useMemo } from 'react';
import { Button, Input, Modal, ModalFooter } from '../../../shared/ui';
import { cx } from '../../../shared/lib/cx';
import type { Tag, TagGroup } from '../../../shared/types';
import { useSelectionModalState } from '../lib/useSelectionModalState';

type TagSelectionModalProps = {
  open: boolean;
  title: string;
  description: string;
  tags: Tag[];
  tagGroups: TagGroup[];
  initialSelectedIds: string[];
  onClose: () => void;
  onConfirm: (tagIds: string[]) => Promise<void>;
};

export function TagSelectionModal({
  open,
  title,
  description,
  tags,
  tagGroups,
  initialSelectedIds,
  onClose,
  onConfirm,
}: TagSelectionModalProps) {
  const tagGroupNames = useMemo(
    () => new Map(tagGroups.map(group => [group.id, group.name])),
    [tagGroups],
  );

  const filterTags = useCallback(
    (query: string, currentTags: Tag[]) => {
      const trimmedQuery = query.trim().toLowerCase();
      if (!trimmedQuery) {
        return currentTags;
      }

      return currentTags.filter(tag =>
        [tag.name, tagGroupNames.get(tag.groupId ?? '') ?? '']
          .join(' ')
          .toLowerCase()
          .includes(trimmedQuery),
      );
    },
    [tagGroupNames],
  );

  const {
    busy,
    error,
    handleConfirm,
    query,
    results: filteredTags,
    selectedIds,
    setQuery,
    toggleSelection,
  } = useSelectionModalState({
    open,
    items: tags,
    initialSelectedIds,
    loadResults: filterTags,
    onConfirm,
    onClose,
    saveErrorMessage: 'Failed to update tags',
  });

  if (!open) {
    return null;
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      panelClassName="library-modal"
      bodyClassName="library-modal__body"
      footer={
        <ModalFooter layout="horizontal-right">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={handleConfirm}>
            {busy ? 'Saving...' : 'Confirm'}
          </Button>
        </ModalFooter>
      }
    >
      <div className="library-modal__intro">
        <p className="library-modal__description">{description}</p>
      </div>

      <Input
        value={query}
        onChange={event => {
          setQuery(event.target.value);
        }}
        placeholder="Search tags by name or group"
      />

      <div className="library-tag-selection">
        {filteredTags.length === 0 ? (
          <div className="library-empty-copy">No tags matched the current query.</div>
        ) : (
          filteredTags.map(tag => {
            const checked = selectedIds.includes(tag.id);
            const groupName = tagGroupNames.get(tag.groupId ?? '') ?? 'Ungrouped';

            return (
              <label
                key={tag.id}
                className={cx(
                  'library-tag-selection__item',
                  checked && 'library-tag-selection__item--selected',
                )}
              >
                <div className="library-tag-selection__copy">
                  <span className="library-tag-selection__name">{tag.name}</span>
                  <span className="library-tag-selection__meta">{groupName}</span>
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    toggleSelection(tag.id);
                  }}
                />
              </label>
            );
          })
        )}
      </div>

      <div className="library-modal__hint">{selectedIds.length} tags selected</div>
      {error ? <div className="library-inline-error">{error}</div> : null}
    </Modal>
  );
}

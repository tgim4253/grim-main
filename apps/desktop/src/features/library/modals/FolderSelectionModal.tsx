import { useCallback } from 'react';
import { Button, Input, Modal, ModalFooter } from '../../../shared/ui';
import type { VirtualFolder } from '../../../shared/types';
import { ipc } from '../../../shared/lib/ipc';
import { cx } from '../../../shared/lib/cx';
import { useSelectionModalState } from '../lib/useSelectionModalState';

type FolderSelectionModalProps = {
  open: boolean;
  title: string;
  description: string;
  folders: VirtualFolder[];
  initialSelectedIds: string[];
  onClose: () => void;
  onConfirm: (folderIds: string[]) => Promise<void>;
};

export function FolderSelectionModal({
  open,
  title,
  description,
  folders,
  initialSelectedIds,
  onClose,
  onConfirm,
}: FolderSelectionModalProps) {
  const searchFolders = useCallback(async (query: string, currentFolders: VirtualFolder[]) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return currentFolders;
    }

    try {
      return await ipc.folder.search(trimmedQuery);
    } catch {
      const loweredQuery = trimmedQuery.toLowerCase();
      return currentFolders.filter(folder =>
        [folder.name, folder.fullPath, folder.alias ?? '']
          .join(' ')
          .toLowerCase()
          .includes(loweredQuery),
      );
    }
  }, []);

  const { busy, error, handleConfirm, query, results, selectedIds, setQuery, toggleSelection } =
    useSelectionModalState({
      open,
      items: folders,
      initialSelectedIds,
      loadResults: searchFolders,
      onConfirm,
      onClose,
      saveErrorMessage: 'Failed to update folders',
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
        placeholder="Search folders by name, path, or alias"
      />

      <div className="library-folder-selection">
        {results.length === 0 ? (
          <div className="library-empty-copy">No folders matched the current query.</div>
        ) : (
          results.map(folder => {
            const checked = selectedIds.includes(folder.id);
            return (
              <label
                key={folder.id}
                className={cx(
                  'library-folder-selection__item',
                  checked && 'library-folder-selection__item--selected',
                )}
              >
                <div className="library-folder-selection__copy">
                  <span className="library-folder-selection__name">{folder.name}</span>
                  <span className="library-folder-selection__path">{folder.fullPath}</span>
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    toggleSelection(folder.id);
                  }}
                />
              </label>
            );
          })
        )}
      </div>

      <div className="library-modal__hint">{selectedIds.length} folders selected</div>
      {error ? <div className="library-inline-error">{error}</div> : null}
    </Modal>
  );
}

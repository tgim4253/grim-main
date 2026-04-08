import { useEffect, useState } from 'react';
import { Button, Input, Modal, ModalFooter } from '../../../shared/ui';
import type { SaveVirtualFolderPayload, VirtualFolder } from '../../../shared/types';
import { findFolderById } from '../lib/helpers';

type FolderEditorState = {
  folder?: VirtualFolder | null;
  parentId?: string | null;
};

type FolderEditorModalProps = {
  open: boolean;
  state: FolderEditorState | null;
  folders: VirtualFolder[];
  onClose: () => void;
  onSave: (payload: SaveVirtualFolderPayload) => Promise<void>;
};

export function FolderEditorModal({
  open,
  state,
  folders,
  onClose,
  onSave,
}: FolderEditorModalProps) {
  const [name, setName] = useState('');
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !state) {
      return;
    }

    setName(state.folder?.name ?? '');
    setAlias(state.folder?.alias ?? '');
    setError(null);
  }, [open, state]);

  if (!open || !state) {
    return null;
  }

  const parentFolder = findFolderById(folders, state.folder?.parentId ?? state.parentId ?? null);

  const handleSave = () => {
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        await onSave({
          id: state.folder?.id ?? null,
          name: name.trim(),
          alias: alias.trim() || null,
          parentId: state.folder?.parentId ?? state.parentId ?? null,
        });
        onClose();
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to save folder');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Modal
      open={open}
      title={state.folder ? 'Edit Virtual Folder' : 'New Virtual Folder'}
      onClose={onClose}
      panelClassName="library-modal"
      bodyClassName="library-modal__body"
      footer={
        <ModalFooter layout="horizontal-right">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !name.trim()} onClick={handleSave}>
            {busy ? 'Saving...' : 'Save'}
          </Button>
        </ModalFooter>
      }
    >
      <div className="library-modal__intro">
        <p className="library-modal__description">
          {parentFolder ? `Parent: ${parentFolder.fullPath}` : 'Parent: Library root'}
        </p>
      </div>

      <Input
        label="Folder name"
        value={name}
        onChange={event => {
          setName(event.target.value);
        }}
        placeholder="Figure / Hands / Study Queue"
      />

      <Input
        label="Alias"
        value={alias}
        onChange={event => {
          setAlias(event.target.value);
        }}
        placeholder="Optional quick search alias"
      />

      {error ? <div className="library-inline-error">{error}</div> : null}
    </Modal>
  );
}

export type { FolderEditorState };

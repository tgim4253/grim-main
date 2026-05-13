import type { VirtualFolder } from '@/shared/types';
import { FolderSearchModal } from '../../import';

export type ReferenceFolderActionModalProps = {
  open: boolean;
  folders: readonly VirtualFolder[];
  folderId: string;
  busy: boolean;
  error?: string | null;
  selectDisabled: boolean;
  onClose: () => void;
  onFolderChange: (folderId: string) => void;
  onSelectFolder: () => void;
};

export function ReferenceFolderActionModal({
  open,
  folders,
  folderId,
  busy,
  error,
  selectDisabled,
  onClose,
  onFolderChange,
  onSelectFolder,
}: ReferenceFolderActionModalProps) {
  return (
    <FolderSearchModal
      open={open}
      folders={folders}
      folderId={folderId}
      folderDisabled={busy}
      busy={busy}
      errorMessage={error}
      selectFolderDisabled={selectDisabled}
      onClose={onClose}
      onFolderChange={onFolderChange}
      onSelectFolder={onSelectFolder}
    />
  );
}

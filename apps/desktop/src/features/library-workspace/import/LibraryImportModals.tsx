import { Button, Icon, Modal, ModalBody, ModalFooter } from '../../../shared/ui';
import { FolderSearchSelect } from '../../library/components';
import type { VirtualFolder } from '../../../shared/types';
import './library-import-modal.css';

export type ImportSummary = {
  importedCount: number;
  totalSize: string;
  destinationFolder: string;
};

type ImportModalBaseProps = {
  open: boolean;
  onClose: () => void;
};

type FolderPickerProps = {
  folders?: readonly VirtualFolder[];
  folderId?: string;
  onFolderChange?: (folderId: string, folder?: VirtualFolder) => void;
};

export type FolderSearchModalProps = ImportModalBaseProps &
  FolderPickerProps & {
    onSelectFolder?: () => void;
  };

export type ImportAssetsModalProps = ImportModalBaseProps &
  FolderPickerProps & {
    onSelectFiles?: () => void;
  };

export type ImportCompletedModalProps = ImportModalBaseProps &
  FolderPickerProps & {
    summary?: ImportSummary;
    onDone?: () => void;
  };

type ModalFolderSearchSelectProps = FolderPickerProps & {
  label: string;
  placeholder: string;
  className?: string;
};

const EMPTY_FOLDERS: readonly VirtualFolder[] = [];

const DEFAULT_IMPORT_SUMMARY: ImportSummary = {
  importedCount: 14,
  totalSize: '128.4 MB',
  destinationFolder: 'Search directories...',
};

function ModalFolderSearchSelect({
  folders = EMPTY_FOLDERS,
  folderId,
  onFolderChange,
  label,
  placeholder,
  className,
}: ModalFolderSearchSelectProps) {
  return (
    <FolderSearchSelect
      className={className}
      label={label}
      placeholder={placeholder}
      folders={folders}
      value={folderId}
      onValueChange={onFolderChange}
      emptyMessage="No folders found"
    />
  );
}

export function FolderSearchModal({
  open,
  folders,
  folderId,
  onFolderChange,
  onClose,
  onSelectFolder,
}: FolderSearchModalProps) {
  return (
    <Modal
      open={open}
      size="lg"
      title="Select Folder"
      dialogClassName="library-import-modal__dialog"
      onClose={onClose}
      body={
        <ModalBody className="library-import-modal__body library-import-modal__body--folder">
          <ModalFolderSearchSelect
            className="library-import-modal__folder-select"
            label="Folder"
            placeholder="Search folders"
            folders={folders}
            folderId={folderId}
            onFolderChange={onFolderChange}
          />
        </ModalBody>
      }
      footer={
        <ModalFooter alignment="end">
          <Button size="lg" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" onClick={onSelectFolder ?? onClose}>
            Select Folder
          </Button>
        </ModalFooter>
      }
    />
  );
}

export function ImportAssetsModal({
  open,
  folders,
  folderId,
  onFolderChange,
  onClose,
  onSelectFiles,
}: ImportAssetsModalProps) {
  return (
    <Modal
      open={open}
      size="lg"
      title="Import Assets"
      dialogClassName="library-import-modal__dialog"
      onClose={onClose}
      body={
        <ModalBody className="library-import-modal__body library-import-modal__body--assets">
          <ModalFolderSearchSelect
            className="library-import-modal__folder-select"
            label="Destination Folder"
            placeholder="Search destination folder"
            folders={folders}
            folderId={folderId}
            onFolderChange={onFolderChange}
          />
          <p className="library-import-modal__supporting-copy">
            Drag and drop your asset files here. Supported formats include .jpg, .png, .svg, and
            .obj.
          </p>
          <button
            type="button"
            className="library-import-modal__drop-zone"
            onClick={onSelectFiles}
            aria-label="Select asset files"
          >
            <Icon name="file" size="xl" color="brand" hierarchy="tertiary" aria-hidden />
            <span className="library-import-modal__drop-title">Drag &amp; Drop files here</span>
            <span className="library-import-modal__drop-copy">
              or click to browse from your machine
            </span>
          </button>
        </ModalBody>
      }
      footer={
        <ModalFooter alignment="end">
          <Button size="lg" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" onClick={onSelectFiles ?? onClose}>
            Select Files
          </Button>
        </ModalFooter>
      }
    />
  );
}

export function ImportCompletedModal({
  open,
  summary = DEFAULT_IMPORT_SUMMARY,
  folders,
  folderId,
  onFolderChange,
  onClose,
  onDone,
}: ImportCompletedModalProps) {
  return (
    <Modal
      open={open}
      size="lg"
      title="Import Completed"
      dialogClassName="library-import-modal__dialog"
      onClose={onClose}
      body={
        <ModalBody className="library-import-modal__body library-import-modal__body--completed">
          <div className="library-import-modal__summary">
            <div className="library-import-modal__metric">
              <div className="library-import-modal__metric-label">STATUS</div>
              <div className="library-import-modal__metric-value">
                <span className="library-import-modal__status-dot" aria-hidden />
                <span>{summary.importedCount.toLocaleString()} Assets Imported</span>
              </div>
            </div>
            <div className="library-import-modal__metric">
              <div className="library-import-modal__metric-label">TOTAL SIZE</div>
              <div className="library-import-modal__metric-value">
                <Icon name="file" size="xs" color="brand" hierarchy="tertiary" aria-hidden />
                <span>{summary.totalSize}</span>
              </div>
            </div>
          </div>

          <div className="library-import-modal__destination">
            <div className="library-import-modal__destination-heading">
              <Icon name="folder" size="sm" hierarchy="tertiary" aria-hidden />
              <span>Destination Folder</span>
            </div>
            <ModalFolderSearchSelect
              className="library-import-modal__folder-select"
              label="Folder"
              placeholder={summary.destinationFolder}
              folders={folders}
              folderId={folderId}
              onFolderChange={onFolderChange}
            />
          </div>
        </ModalBody>
      }
      footer={
        <ModalFooter alignment="end">
          <Button size="lg" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" onClick={onDone ?? onClose}>
            Done
          </Button>
        </ModalFooter>
      }
    />
  );
}

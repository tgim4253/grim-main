import { Button, Icon, Modal, ModalBody, ModalFooter } from '../../../shared/ui';
import { cx } from '../../../shared/lib/cx';
import { FolderSearchSelect } from '../../library/components';
import type { VirtualFolder } from '../../../shared/types';
import './library-import-modal.css';

export type ImportSummary = {
  importedCount: number;
  reusedCount: number;
  processedCount: number;
  failedCount: number;
  totalSize: string;
  destinationFolder: string;
};

export type ImportFilePreview = {
  assetCount: number;
  totalSize: string;
};

export type ImportProgress = {
  completed: number;
  total: number;
};

type ImportModalBaseProps = {
  open: boolean;
  onClose: () => void;
  busy?: boolean;
  errorMessage?: string | null;
};

type FolderPickerProps = {
  folders?: readonly VirtualFolder[];
  folderId?: string;
  onFolderChange?: (folderId: string, folder?: VirtualFolder) => void;
  folderDisabled?: boolean;
};

export type FolderSearchModalProps = ImportModalBaseProps &
  FolderPickerProps & {
    onSelectFolder?: () => void;
    selectFolderDisabled?: boolean;
  };

export type ImportAssetsModalProps = ImportModalBaseProps &
  FolderPickerProps & {
    filePreview?: ImportFilePreview;
    progress?: ImportProgress;
    busyLabel?: string;
    onSelectFiles?: () => void;
    onSelectFolders?: () => void;
    onImport?: () => void;
    selectFilesDisabled?: boolean;
    selectFoldersDisabled?: boolean;
    importDisabled?: boolean;
    dragActive?: boolean;
  };

export type ImportCompletedModalProps = ImportModalBaseProps &
  FolderPickerProps & {
    summary?: ImportSummary;
    onDone?: () => void;
    doneDisabled?: boolean;
  };

type ModalFolderSearchSelectProps = FolderPickerProps & {
  label: string;
  placeholder: string;
  className?: string;
};

const EMPTY_FOLDERS: readonly VirtualFolder[] = [];

const DEFAULT_IMPORT_SUMMARY: ImportSummary = {
  importedCount: 0,
  reusedCount: 0,
  processedCount: 0,
  failedCount: 0,
  totalSize: '0 B',
  destinationFolder: 'Search directories...',
};

function formatImportStatus(summary: ImportSummary) {
  if (summary.processedCount === 0 && summary.failedCount === 0) {
    return 'No assets imported';
  }

  const segments: string[] = [];
  if (summary.importedCount > 0) {
    segments.push(`${summary.importedCount.toLocaleString()} imported`);
  }
  if (summary.reusedCount > 0) {
    segments.push(`${summary.reusedCount.toLocaleString()} reused`);
  }
  if (summary.failedCount > 0) {
    segments.push(`${summary.failedCount.toLocaleString()} failed`);
  }

  return segments.join(', ');
}

function getImportStatusTone(summary: ImportSummary) {
  if (summary.failedCount === 0) {
    return 'success';
  }

  return summary.processedCount > 0 ? 'warning' : 'error';
}

function ModalErrorMessage({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <p className="library-import-modal__error" role="alert">
      {message}
    </p>
  );
}

function ImportPreviewCard({
  filePreview,
  progress,
}: {
  filePreview?: ImportFilePreview;
  progress?: ImportProgress;
}) {
  if (!filePreview && !progress) {
    return null;
  }

  const progressValue =
    progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="library-import-modal__preview" aria-live="polite">
      <div className="library-import-modal__preview-metrics">
        <div className="library-import-modal__preview-metric">
          <span className="library-import-modal__preview-label">ASSETS</span>
          <span className="library-import-modal__preview-value">
            {(filePreview?.assetCount ?? progress?.total ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="library-import-modal__preview-metric">
          <span className="library-import-modal__preview-label">TOTAL SIZE</span>
          <span className="library-import-modal__preview-value">
            {filePreview?.totalSize ?? '0 B'}
          </span>
        </div>
      </div>
      {progress ? (
        <div className="library-import-modal__progress">
          <div className="library-import-modal__progress-copy">
            <span>
              {progress.completed.toLocaleString()} / {progress.total.toLocaleString()}
            </span>
            <span>{progressValue.toLocaleString()}%</span>
          </div>
          <div
            className="library-import-modal__progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.completed}
          >
            <div
              className="library-import-modal__progress-fill"
              style={{ width: `${String(progressValue)}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModalFolderSearchSelect({
  folders = EMPTY_FOLDERS,
  folderId,
  onFolderChange,
  folderDisabled = false,
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
      disabled={folderDisabled}
    />
  );
}

export function FolderSearchModal({
  open,
  folders,
  folderId,
  onFolderChange,
  folderDisabled = false,
  onClose,
  busy = false,
  errorMessage,
  onSelectFolder,
  selectFolderDisabled = false,
}: FolderSearchModalProps) {
  return (
    <Modal
      open={open}
      size="lg"
      title="Select Folder"
      dialogClassName="library-import-modal__dialog"
      onClose={busy ? undefined : onClose}
      body={
        <ModalBody className="library-import-modal__body library-import-modal__body--folder">
          <ModalFolderSearchSelect
            className="library-import-modal__folder-select"
            label="Folder"
            placeholder="Search folders"
            folders={folders}
            folderId={folderId}
            onFolderChange={onFolderChange}
            folderDisabled={busy || folderDisabled}
          />
          <ModalErrorMessage message={errorMessage} />
        </ModalBody>
      }
      footer={
        <ModalFooter alignment="end">
          <Button size="lg" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="lg"
            onClick={onSelectFolder ?? onClose}
            disabled={busy || selectFolderDisabled}
          >
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
  folderDisabled = false,
  onClose,
  busy = false,
  busyLabel,
  errorMessage,
  filePreview,
  progress,
  onSelectFiles,
  onSelectFolders,
  onImport,
  selectFilesDisabled = false,
  selectFoldersDisabled = false,
  importDisabled = false,
  dragActive = false,
}: ImportAssetsModalProps) {
  const dropTitle = busy ? (busyLabel ?? 'Working...') : 'Drag & Drop files here';
  const dropCopy = busy
    ? 'Please wait'
    : filePreview
      ? 'Review the files, then import when ready'
      : 'or click to browse files or folders from your machine';

  return (
    <Modal
      open={open}
      size="lg"
      title="Import Assets"
      dialogClassName="library-import-modal__dialog"
      onClose={busy ? undefined : onClose}
      body={
        <ModalBody className="library-import-modal__body library-import-modal__body--assets">
          <ModalFolderSearchSelect
            className="library-import-modal__folder-select"
            label="Destination Folder"
            placeholder="Search destination folder"
            folders={folders}
            folderId={folderId}
            onFolderChange={onFolderChange}
            folderDisabled={busy || folderDisabled}
          />
          <p className="library-import-modal__supporting-copy">
            Drag and drop image files or folders here. Supported formats include .png, .jpg, .jpeg,
            .webp, .bmp, .gif, .tif, and .tiff.
          </p>
          <ModalErrorMessage message={errorMessage} />
          <ImportPreviewCard filePreview={filePreview} progress={progress} />
          <button
            type="button"
            className={cx(
              'library-import-modal__drop-zone',
              dragActive && 'library-import-modal__drop-zone--active',
            )}
            onClick={onSelectFiles}
            disabled={busy || selectFilesDisabled}
            aria-label="Select asset files"
            aria-busy={busy}
          >
            <Icon name="file" size="xl" color="brand" hierarchy="tertiary" aria-hidden />
            <span className="library-import-modal__drop-title">{dropTitle}</span>
            <span className="library-import-modal__drop-copy">{dropCopy}</span>
          </button>
        </ModalBody>
      }
      footer={
        <ModalFooter alignment="end">
          <Button size="lg" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={onSelectFiles ?? onClose}
            disabled={busy || selectFilesDisabled}
          >
            Select Files
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={onSelectFolders ?? onClose}
            disabled={busy || selectFoldersDisabled}
          >
            Select Folder
          </Button>
          <Button
            size="lg"
            onClick={onImport}
            disabled={busy || importDisabled}
            aria-label={progress ? 'Import in progress' : 'Import selected assets'}
          >
            Import
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
  folderDisabled = false,
  onClose,
  busy = false,
  errorMessage,
  onDone,
  doneDisabled = false,
}: ImportCompletedModalProps) {
  const statusTone = getImportStatusTone(summary);

  return (
    <Modal
      open={open}
      size="lg"
      title="Import Completed"
      dialogClassName="library-import-modal__dialog"
      onClose={busy ? undefined : onClose}
      body={
        <ModalBody className="library-import-modal__body library-import-modal__body--completed">
          <div className="library-import-modal__summary">
            <div className="library-import-modal__metric">
              <div className="library-import-modal__metric-label">STATUS</div>
              <div className="library-import-modal__metric-value">
                <span
                  className={cx(
                    'library-import-modal__status-dot',
                    statusTone !== 'success' && `library-import-modal__status-dot--${statusTone}`,
                  )}
                  aria-hidden
                />
                <span>{formatImportStatus(summary)}</span>
              </div>
            </div>
            {summary.failedCount > 0 ? (
              <div className="library-import-modal__metric">
                <div className="library-import-modal__metric-label">FAILED</div>
                <div className="library-import-modal__metric-value">
                  <Icon name="file" size="xs" color="brand" hierarchy="tertiary" aria-hidden />
                  <span>{summary.failedCount.toLocaleString()}</span>
                </div>
              </div>
            ) : null}
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
              folderDisabled={busy || folderDisabled}
            />
          </div>
          <ModalErrorMessage message={errorMessage} />
        </ModalBody>
      }
      footer={
        <ModalFooter alignment="end">
          <Button size="lg" variant="secondary" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button size="lg" onClick={onDone ?? onClose} disabled={busy || doneDisabled}>
            Done
          </Button>
        </ModalFooter>
      }
    />
  );
}

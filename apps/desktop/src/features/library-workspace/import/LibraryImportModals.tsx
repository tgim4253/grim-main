import { useTranslation } from 'react-i18next';
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
  destinationFolder: '',
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

function formatImportStatus(summary: ImportSummary, t: Translate) {
  if (summary.processedCount === 0 && summary.failedCount === 0) {
    return t('import.no_assets_imported', { defaultValue: 'No assets imported' });
  }

  const segments: string[] = [];
  if (summary.importedCount > 0) {
    segments.push(
      t('import.status.imported', {
        count: summary.importedCount,
        formattedCount: summary.importedCount.toLocaleString(),
        defaultValue: '{{formattedCount}} imported',
      }),
    );
  }
  if (summary.reusedCount > 0) {
    segments.push(
      t('import.status.reused', {
        count: summary.reusedCount,
        formattedCount: summary.reusedCount.toLocaleString(),
        defaultValue: '{{formattedCount}} reused',
      }),
    );
  }
  if (summary.failedCount > 0) {
    segments.push(
      t('import.status.failed', {
        count: summary.failedCount,
        formattedCount: summary.failedCount.toLocaleString(),
        defaultValue: '{{formattedCount}} failed',
      }),
    );
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
  const { t } = useTranslation('common');

  if (!filePreview && !progress) {
    return null;
  }

  const progressValue =
    progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="library-import-modal__preview" aria-live="polite">
      <div className="library-import-modal__preview-metrics">
        <div className="library-import-modal__preview-metric">
          <span className="library-import-modal__preview-label">
            {t('import.preview.assets', { defaultValue: 'ASSETS' })}
          </span>
          <span className="library-import-modal__preview-value">
            {(filePreview?.assetCount ?? progress?.total ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="library-import-modal__preview-metric">
          <span className="library-import-modal__preview-label">
            {t('import.preview.total_size', { defaultValue: 'TOTAL SIZE' })}
          </span>
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
  const { t } = useTranslation('common');

  return (
    <FolderSearchSelect
      className={className}
      label={label}
      placeholder={placeholder}
      folders={folders}
      value={folderId}
      onValueChange={onFolderChange}
      emptyMessage={t('folders.no_folders_found', { defaultValue: 'No folders found' })}
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
  const { t } = useTranslation('common');

  return (
    <Modal
      open={open}
      size="lg"
      title={t('import.select_folder.title', { defaultValue: 'Select Folder' })}
      dialogClassName="library-import-modal__dialog"
      onClose={busy ? undefined : onClose}
      body={
        <ModalBody className="library-import-modal__body library-import-modal__body--folder">
          <ModalFolderSearchSelect
            className="library-import-modal__folder-select"
            label={t('folders.folder', { defaultValue: 'Folder' })}
            placeholder={t('folders.search_folders', { defaultValue: 'Search folders' })}
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
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="lg"
            onClick={onSelectFolder ?? onClose}
            disabled={busy || selectFolderDisabled}
          >
            {t('import.select_folder.action', { defaultValue: 'Select Folder' })}
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
  const { t } = useTranslation('common');
  const dropTitle = busy
    ? (busyLabel ?? t('common.working', { defaultValue: 'Working...' }))
    : t('import.drop_title', { defaultValue: 'Drag & Drop files here' });
  const dropCopy = busy
    ? t('common.please_wait', { defaultValue: 'Please wait' })
    : filePreview
      ? t('import.review_files_hint', {
          defaultValue: 'Review the files, then import when ready',
        })
      : t('import.browse_files_hint', {
          defaultValue: 'or click to browse files or folders from your machine',
        });

  return (
    <Modal
      open={open}
      size="lg"
      title={t('import.assets.title', { defaultValue: 'Import Assets' })}
      dialogClassName="library-import-modal__dialog"
      onClose={busy ? undefined : onClose}
      body={
        <ModalBody className="library-import-modal__body library-import-modal__body--assets">
          <ModalFolderSearchSelect
            className="library-import-modal__folder-select"
            label={t('import.destination_folder', { defaultValue: 'Destination Folder' })}
            placeholder={t('import.search_destination_folder', {
              defaultValue: 'Search destination folder',
            })}
            folders={folders}
            folderId={folderId}
            onFolderChange={onFolderChange}
            folderDisabled={busy || folderDisabled}
          />
          <p className="library-import-modal__supporting-copy">
            {t('import.supported_formats_help', {
              defaultValue:
                'Drag and drop image files or folders here. Supported formats include .png, .jpg, .jpeg, .webp, .bmp, .gif, .tif, and .tiff.',
            })}
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
            aria-label={t('import.select_asset_files', { defaultValue: 'Select asset files' })}
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
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={onSelectFiles ?? onClose}
            disabled={busy || selectFilesDisabled}
          >
            {t('import.select_files', { defaultValue: 'Select Files' })}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={onSelectFolders ?? onClose}
            disabled={busy || selectFoldersDisabled}
          >
            {t('import.select_folder.action', { defaultValue: 'Select Folder' })}
          </Button>
          <Button
            size="lg"
            onClick={onImport}
            disabled={busy || importDisabled}
            aria-label={
              progress
                ? t('import.in_progress', { defaultValue: 'Import in progress' })
                : t('import.selected_assets', { defaultValue: 'Import selected assets' })
            }
          >
            {t('common.import', { defaultValue: 'Import' })}
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
  const { t } = useTranslation('common');
  const resolvedSummary = summary.destinationFolder
    ? summary
    : {
        ...summary,
        destinationFolder: t('import.search_directories', {
          defaultValue: 'Search directories...',
        }),
      };
  const statusTone = getImportStatusTone(resolvedSummary);

  return (
    <Modal
      open={open}
      size="lg"
      title={t('import.completed.title', { defaultValue: 'Import Completed' })}
      dialogClassName="library-import-modal__dialog"
      onClose={busy ? undefined : onClose}
      body={
        <ModalBody className="library-import-modal__body library-import-modal__body--completed">
          <div className="library-import-modal__summary">
            <div className="library-import-modal__metric">
              <div className="library-import-modal__metric-label">
                {t('import.metric.status', { defaultValue: 'STATUS' })}
              </div>
              <div className="library-import-modal__metric-value">
                <span
                  className={cx(
                    'library-import-modal__status-dot',
                    statusTone !== 'success' && `library-import-modal__status-dot--${statusTone}`,
                  )}
                  aria-hidden
                />
                <span>{formatImportStatus(resolvedSummary, t)}</span>
              </div>
            </div>
            {resolvedSummary.failedCount > 0 ? (
              <div className="library-import-modal__metric">
                <div className="library-import-modal__metric-label">
                  {t('import.metric.failed', { defaultValue: 'FAILED' })}
                </div>
                <div className="library-import-modal__metric-value">
                  <Icon name="file" size="xs" color="brand" hierarchy="tertiary" aria-hidden />
                  <span>{resolvedSummary.failedCount.toLocaleString()}</span>
                </div>
              </div>
            ) : null}
            <div className="library-import-modal__metric">
              <div className="library-import-modal__metric-label">
                {t('import.metric.total_size', { defaultValue: 'TOTAL SIZE' })}
              </div>
              <div className="library-import-modal__metric-value">
                <Icon name="file" size="xs" color="brand" hierarchy="tertiary" aria-hidden />
                <span>{resolvedSummary.totalSize}</span>
              </div>
            </div>
          </div>

          <div className="library-import-modal__destination">
            <div className="library-import-modal__destination-heading">
              <Icon name="folder" size="sm" hierarchy="tertiary" aria-hidden />
              <span>{t('import.destination_folder', { defaultValue: 'Destination Folder' })}</span>
            </div>
            <ModalFolderSearchSelect
              className="library-import-modal__folder-select"
              label={t('folders.folder', { defaultValue: 'Folder' })}
              placeholder={resolvedSummary.destinationFolder}
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
            {t('common.close', { defaultValue: 'Close' })}
          </Button>
          <Button size="lg" onClick={onDone ?? onClose} disabled={busy || doneDisabled}>
            {t('common.done', { defaultValue: 'Done' })}
          </Button>
        </ModalFooter>
      }
    />
  );
}

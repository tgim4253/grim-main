import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '@/lib/format';
import type { AssetListSource, ImportPreviewResult, VirtualFolder } from '@/shared/types';
import { DROP_IMAGE_WARNING_THRESHOLD } from '../dropFileData';
import { getDefaultImportFolderId } from './importSelection';
import { useImportDialogSelection } from './useImportDialogSelection';
import { useImportDragDropPreview } from './useImportDragDropPreview';
import { useImportExecution } from './useImportExecution';
import { useImportFilePathPreview } from './useImportFilePathPreview';
import type { ImportFilePreview, ImportProgress, ImportStep, ImportSummary } from './types';

export type { ImportStep } from './types';

export type UseLibraryImportFlowOptions = {
  folders: readonly VirtualFolder[];
  folderById: ReadonlyMap<string, VirtualFolder>;
  assetSource: AssetListSource;
  explorerLoading: boolean;
  onImported?: () => Promise<void> | void;
};

export type LibraryImportFlow = {
  folders: readonly VirtualFolder[];
  folderId?: string;
  step: ImportStep | null;
  error?: string | null;
  summary?: ImportSummary;
  filePreview?: ImportFilePreview;
  progress?: ImportProgress;
  importDropWarning: ReturnType<typeof useImportDragDropPreview>['importDropWarning'];
  importBusy: boolean;
  isImporting: boolean;
  isImportPreviewing: boolean;
  isFilePickerOpen: boolean;
  isImportDragActive: boolean;
  hasImportSelection: boolean;
  canUseSelectedFolder: boolean;
  open: () => void;
  close: () => void;
  changeFolder: (folderId: string) => void;
  selectFolder: () => void;
  selectFiles: () => void;
  selectFolders: () => void;
  importPreviewedFiles: () => void;
  cancelLargeImportDrop: () => void;
  continueLargeImportDrop: () => void;
};

export function useLibraryImportFlow({
  folders,
  folderById,
  assetSource,
  explorerLoading,
  onImported,
}: UseLibraryImportFlowOptions): LibraryImportFlow {
  const { t } = useTranslation('common');
  const [importStep, setImportStep] = useState<ImportStep | null>(null);
  const [importFolderId, setImportFolderId] = useState<string | undefined>();
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | undefined>();
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | undefined>();
  const [importDroppedFiles, setImportDroppedFiles] = useState<readonly File[] | undefined>();
  const [importProgress, setImportProgress] = useState<ImportProgress | undefined>();
  const [isImporting, setIsImporting] = useState(false);
  const [isImportPreviewing, setIsImportPreviewing] = useState(false);
  const importInFlightRef = useRef(false);
  const importPreviewInFlightRef = useRef(false);
  const noDestinationFoldersError = t('import.error.no_destination_folders', {
    defaultValue: 'No destination folders are available for import.',
  });
  const canUseSelectedFolder = Boolean(importFolderId && folderById.has(importFolderId));
  const filePreview = useMemo(
    () => getImportFilePreview(importPreview, importDroppedFiles),
    [importDroppedFiles, importPreview],
  );
  const hasImportSelection = Boolean(importPreview || importDroppedFiles?.length);
  const defaultFolderId = useMemo(
    () => getDefaultImportFolderId({ assetSource, folderById }),
    [assetSource, folderById],
  );

  const previewImportFilePaths = useImportFilePathPreview({
    folderById,
    importFolderId,
    importInFlightRef,
    importPreviewInFlightRef,
    setImportError,
    setImportStep,
    setImportSummary,
    setImportPreview,
    setImportDroppedFiles,
    setImportProgress,
    setIsImportPreviewing,
    t,
  });

  const dialogSelection = useImportDialogSelection({
    importInFlightRef,
    previewImportFilePaths,
    setImportError,
    t,
  });

  const dragDropPreview = useImportDragDropPreview({
    folderById,
    importFolderId,
    importStep,
    importInFlightRef,
    importPreviewInFlightRef,
    isImporting,
    isImportPreviewing,
    isFilePickerOpen: dialogSelection.isFilePickerOpen,
    setImportError,
    setImportStep,
    setImportSummary,
    setImportPreview,
    setImportDroppedFiles,
    setImportProgress,
    setIsImportPreviewing,
    t,
  });

  const handleImportPreviewedFiles = useImportExecution({
    folderById,
    importFolderId,
    importDroppedFiles,
    importPreview,
    importInFlightRef,
    importPreviewInFlightRef,
    onImported,
    resetImportDragState: dragDropPreview.resetImportDragState,
    setImportError,
    setImportStep,
    setImportSummary,
    setImportPreview,
    setImportDroppedFiles,
    setImportProgress,
    setIsImporting,
    t,
  });

  const importBusy =
    isImporting || isImportPreviewing || dragDropPreview.importDropWarning !== null;

  const resetImportState = useCallback(() => {
    setImportSummary(undefined);
    setImportPreview(undefined);
    setImportDroppedFiles(undefined);
    setImportProgress(undefined);
    dragDropPreview.clearImportDropConfirmation();
    dragDropPreview.resetImportDragState();
  }, [dragDropPreview]);

  const handleOpenImport = useCallback(() => {
    if (explorerLoading) {
      return;
    }

    setImportFolderId(defaultFolderId);
    resetImportState();
    setImportError(folders.length > 0 ? null : noDestinationFoldersError);
    setImportStep('folder');
  }, [
    defaultFolderId,
    explorerLoading,
    folders.length,
    noDestinationFoldersError,
    resetImportState,
  ]);

  const handleCloseImport = useCallback(() => {
    if (
      importInFlightRef.current ||
      importPreviewInFlightRef.current ||
      dialogSelection.filePickerOpenRef.current ||
      dragDropPreview.hasPendingImportDropConfirmation()
    ) {
      return;
    }

    setImportStep(null);
    setImportFolderId(undefined);
    setImportError(null);
    resetImportState();
  }, [dialogSelection.filePickerOpenRef, dragDropPreview, resetImportState]);

  useEffect(() => {
    if (
      importStep !== 'folder' ||
      importError !== noDestinationFoldersError ||
      folders.length === 0
    ) {
      return;
    }

    setImportError(null);
  }, [folders.length, importError, importStep, noDestinationFoldersError]);

  const handleImportFolderChange = useCallback((folderId: string) => {
    setImportFolderId(folderId);
    setImportError(null);
  }, []);

  const handleSelectImportFolder = useCallback(() => {
    if (!importFolderId || !folderById.has(importFolderId)) {
      setImportError(
        t('import.error.select_destination_before_files', {
          defaultValue: 'Select a destination folder before choosing files.',
        }),
      );
      return;
    }

    setImportError(null);
    setImportStep('assets');
  }, [folderById, importFolderId, t]);

  return {
    folders,
    folderId: importFolderId,
    step: importStep,
    error: importError,
    summary: importSummary,
    filePreview,
    progress: importProgress,
    importDropWarning: dragDropPreview.importDropWarning,
    importBusy,
    isImporting,
    isImportPreviewing,
    isFilePickerOpen: dialogSelection.isFilePickerOpen,
    isImportDragActive: dragDropPreview.isImportDragActive,
    hasImportSelection,
    canUseSelectedFolder,
    open: handleOpenImport,
    close: handleCloseImport,
    changeFolder: handleImportFolderChange,
    selectFolder: handleSelectImportFolder,
    selectFiles: dialogSelection.selectFiles,
    selectFolders: dialogSelection.selectFolders,
    importPreviewedFiles: handleImportPreviewedFiles,
    cancelLargeImportDrop: dragDropPreview.cancelLargeImportDrop,
    continueLargeImportDrop: dragDropPreview.continueLargeImportDrop,
  };
}

function getImportFilePreview(
  importPreview?: ImportPreviewResult,
  importDroppedFiles?: readonly File[],
): ImportFilePreview | undefined {
  if (importPreview) {
    return {
      assetCount: importPreview.assetCount,
      totalSize: formatBytes(importPreview.totalSize),
    };
  }

  if (!importDroppedFiles) {
    return undefined;
  }

  return {
    assetCount: importDroppedFiles.length,
    totalSize: formatBytes(importDroppedFiles.reduce((sum, file) => sum + file.size, 0)),
  };
}

export { DROP_IMAGE_WARNING_THRESHOLD };

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '@/lib/format';
import { getErrorMessage } from '@/shared/lib/error';
import { ipc } from '@/shared/lib/ipc';
import type { AssetListSource, ImportPreviewResult, VirtualFolder } from '@/shared/types';
import type { ImportFilePreview, ImportProgress, ImportSummary } from '../LibraryImportModals';
import {
  DROP_IMAGE_WARNING_THRESHOLD,
  collectSupportedDroppedImageFiles,
  createDroppedFileDataSource,
  fileToDataImageSource,
  formatDroppedImageFileWarnings,
  hasFileDropData,
  type DroppedFileDataSource,
  type DroppedImageFileCollection,
} from '../dropFileData';
import { getDropImportWarning, useDropImportConfirmation } from '../lib/dropImportConfirmation';
import {
  createEmptyImportResult,
  createImportSummary,
  formatPreviewFailureMessage,
  mergeImportResult,
} from './importSummary';
import {
  SUPPORTED_IMPORT_EXTENSIONS,
  getDefaultImportFolderId,
  normalizeDialogSelection,
  normalizeSelectedFilePaths,
} from './importSelection';

export type ImportStep = 'folder' | 'assets' | 'completed';

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
  importDropWarning: ReturnType<typeof useDropImportConfirmation<DroppedFileDataSource>>['warning'];
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
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [isImportDragActive, setIsImportDragActive] = useState(false);
  const importInFlightRef = useRef(false);
  const importPreviewInFlightRef = useRef(false);
  const filePickerOpenRef = useRef(false);
  const importDomDragDepthRef = useRef(0);
  const {
    warning: importDropWarning,
    requestConfirmation: requestImportDropConfirmation,
    clearConfirmation: clearImportDropConfirmation,
    takePendingConfirmation: takePendingImportDropConfirmation,
    hasPendingConfirmation: hasPendingImportDropConfirmation,
  } = useDropImportConfirmation<DroppedFileDataSource>();
  const noDestinationFoldersError = t('import.error.no_destination_folders', {
    defaultValue: 'No destination folders are available for import.',
  });
  const canUseSelectedFolder = Boolean(importFolderId && folderById.has(importFolderId));
  const importBusy = isImporting || isImportPreviewing || importDropWarning !== null;
  const filePreview = importPreview
    ? {
        assetCount: importPreview.assetCount,
        totalSize: formatBytes(importPreview.totalSize),
      }
    : importDroppedFiles
      ? {
          assetCount: importDroppedFiles.length,
          totalSize: formatBytes(importDroppedFiles.reduce((sum, file) => sum + file.size, 0)),
        }
      : undefined;
  const hasImportSelection = Boolean(importPreview || importDroppedFiles?.length);

  const defaultFolderId = useMemo(
    () => getDefaultImportFolderId({ assetSource, folderById }),
    [assetSource, folderById],
  );

  const handleOpenImport = useCallback(() => {
    if (explorerLoading) {
      return;
    }

    setImportFolderId(defaultFolderId);
    setImportSummary(undefined);
    setImportPreview(undefined);
    setImportDroppedFiles(undefined);
    setImportProgress(undefined);
    clearImportDropConfirmation();
    setImportError(folders.length > 0 ? null : noDestinationFoldersError);
    setImportStep('folder');
    setIsImportDragActive(false);
  }, [
    clearImportDropConfirmation,
    defaultFolderId,
    explorerLoading,
    folders.length,
    noDestinationFoldersError,
  ]);

  const handleCloseImport = useCallback(() => {
    if (
      importInFlightRef.current ||
      importPreviewInFlightRef.current ||
      filePickerOpenRef.current ||
      hasPendingImportDropConfirmation()
    ) {
      return;
    }

    setImportStep(null);
    setImportFolderId(undefined);
    setImportError(null);
    setImportSummary(undefined);
    setImportPreview(undefined);
    setImportDroppedFiles(undefined);
    setImportProgress(undefined);
    clearImportDropConfirmation();
    setIsImportDragActive(false);
    importDomDragDepthRef.current = 0;
  }, [clearImportDropConfirmation, hasPendingImportDropConfirmation]);

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

  const applyImportDroppedFileCollection = useCallback(
    (collection: DroppedImageFileCollection) => {
      const warningMessage = formatDroppedImageFileWarnings(collection);
      setImportSummary(undefined);
      setImportPreview(undefined);
      setImportDroppedFiles(undefined);
      setImportProgress(undefined);

      if (collection.files.length === 0) {
        setImportError(
          warningMessage ??
            t('import.error.no_supported_images', {
              defaultValue: 'No supported image files were found.',
            }),
        );
        setImportStep('assets');
        return;
      }

      setImportDroppedFiles(collection.files);
      setImportError(warningMessage);
      setImportStep('assets');
    },
    [t],
  );

  const previewImportFilePaths = useCallback(
    async (filePaths: readonly string[]) => {
      if (importInFlightRef.current || importPreviewInFlightRef.current) {
        return;
      }

      if (!importFolderId) {
        setImportError(
          t('import.error.select_destination_before_files', {
            defaultValue: 'Select a destination folder before choosing files.',
          }),
        );
        setImportStep('folder');
        return;
      }

      const destinationFolder = folderById.get(importFolderId);
      if (!destinationFolder) {
        setImportError(
          t('import.error.destination_cannot_receive_assets', {
            defaultValue: 'The selected destination folder cannot receive imported assets.',
          }),
        );
        setImportStep('folder');
        return;
      }

      const selectedPaths = normalizeSelectedFilePaths(filePaths);
      if (selectedPaths.length === 0) {
        setImportError(
          t('import.error.select_image_file_or_folder', {
            defaultValue: 'Select at least one image file or folder.',
          }),
        );
        setImportPreview(undefined);
        setImportDroppedFiles(undefined);
        setImportProgress(undefined);
        setImportStep('assets');
        return;
      }

      importPreviewInFlightRef.current = true;
      setIsImportPreviewing(true);
      setImportError(null);
      setImportSummary(undefined);
      setImportProgress(undefined);
      setImportDroppedFiles(undefined);

      try {
        const preview = await ipc.import.previewImages({
          filePaths: selectedPaths,
          virtualFolderIds: [importFolderId],
        });
        const previewFailureMessage = formatPreviewFailureMessage(preview.failed.length, t);
        if (preview.assetCount === 0 || preview.filePaths.length === 0) {
          setImportError(
            previewFailureMessage
              ? t('import.error.no_supported_images_with_warning', {
                  warning: previewFailureMessage,
                  defaultValue: 'No supported image files were found. {{warning}}',
                })
              : t('import.error.no_supported_images', {
                  defaultValue: 'No supported image files were found.',
                }),
          );
          setImportPreview(undefined);
          setImportDroppedFiles(undefined);
          setImportStep('assets');
          return;
        }

        setImportPreview(preview);
        setImportDroppedFiles(undefined);
        setImportError(previewFailureMessage);
        setImportStep('assets');
      } catch (error) {
        setImportPreview(undefined);
        setImportDroppedFiles(undefined);
        setImportError(
          getErrorMessage(
            error,
            t('import.error.review_selected_files', {
              defaultValue: 'Failed to review selected files.',
            }),
          ),
        );
        setImportStep('assets');
      } finally {
        importPreviewInFlightRef.current = false;
        setIsImportPreviewing(false);
        setIsImportDragActive(false);
      }
    },
    [folderById, importFolderId, t],
  );

  const previewImportDroppedFiles = useCallback(
    async (source: DroppedFileDataSource) => {
      if (
        importInFlightRef.current ||
        importPreviewInFlightRef.current ||
        hasPendingImportDropConfirmation()
      ) {
        return;
      }

      if (!importFolderId) {
        setImportError(
          t('import.error.select_destination_before_files', {
            defaultValue: 'Select a destination folder before choosing files.',
          }),
        );
        setImportStep('folder');
        return;
      }

      const destinationFolder = folderById.get(importFolderId);
      if (!destinationFolder) {
        setImportError(
          t('import.error.destination_cannot_receive_assets', {
            defaultValue: 'The selected destination folder cannot receive imported assets.',
          }),
        );
        setImportStep('folder');
        return;
      }

      importPreviewInFlightRef.current = true;
      setIsImportPreviewing(true);
      setImportError(null);
      setImportSummary(undefined);
      setImportPreview(undefined);
      setImportDroppedFiles(undefined);
      setImportProgress(undefined);

      try {
        const dropWarning = await getDropImportWarning({ localSource: source });
        if (dropWarning) {
          requestImportDropConfirmation(source, dropWarning);
          setImportStep('assets');
          return;
        }

        const collection = await collectSupportedDroppedImageFiles(source);
        applyImportDroppedFileCollection(collection);
      } catch (error) {
        setImportError(
          getErrorMessage(
            error,
            t('import.error.review_dropped_files', {
              defaultValue: 'Failed to review dropped files.',
            }),
          ),
        );
        setImportStep('assets');
      } finally {
        importPreviewInFlightRef.current = false;
        setIsImportPreviewing(false);
        setIsImportDragActive(false);
        importDomDragDepthRef.current = 0;
      }
    },
    [
      applyImportDroppedFileCollection,
      folderById,
      hasPendingImportDropConfirmation,
      importFolderId,
      requestImportDropConfirmation,
      t,
    ],
  );

  const handleContinueLargeImportDrop = useCallback(() => {
    const source = takePendingImportDropConfirmation();

    if (!source || importInFlightRef.current || importPreviewInFlightRef.current) {
      return;
    }

    importPreviewInFlightRef.current = true;
    setIsImportPreviewing(true);
    setImportError(null);
    setImportProgress(undefined);

    void (async () => {
      try {
        const collection = await collectSupportedDroppedImageFiles(source);
        applyImportDroppedFileCollection(collection);
      } catch (error) {
        setImportError(
          getErrorMessage(
            error,
            t('import.error.review_dropped_files', {
              defaultValue: 'Failed to review dropped files.',
            }),
          ),
        );
        setImportStep('assets');
      } finally {
        importPreviewInFlightRef.current = false;
        setIsImportPreviewing(false);
        setIsImportDragActive(false);
        importDomDragDepthRef.current = 0;
      }
    })();
  }, [applyImportDroppedFileCollection, t, takePendingImportDropConfirmation]);

  const handleCancelLargeImportDrop = useCallback(() => {
    clearImportDropConfirmation();
    setIsImportDragActive(false);
    importDomDragDepthRef.current = 0;
  }, [clearImportDropConfirmation]);

  const handleImportPreviewedFiles = useCallback(() => {
    if (importInFlightRef.current || importPreviewInFlightRef.current) {
      return;
    }

    if (!importFolderId) {
      setImportError(
        t('import.error.select_destination_before_import', {
          defaultValue: 'Select a destination folder before importing files.',
        }),
      );
      setImportStep('folder');
      return;
    }

    const destinationFolder = folderById.get(importFolderId);
    if (!destinationFolder) {
      setImportError(
        t('import.error.destination_cannot_receive_assets', {
          defaultValue: 'The selected destination folder cannot receive imported assets.',
        }),
      );
      setImportStep('folder');
      return;
    }

    const droppedFiles = importDroppedFiles ?? [];
    const filePaths = importPreview?.filePaths ?? [];
    if (droppedFiles.length === 0 && filePaths.length === 0) {
      setImportError(
        t('import.error.select_image_files_before_import', {
          defaultValue: 'Select image files before importing.',
        }),
      );
      return;
    }

    importInFlightRef.current = true;
    setIsImporting(true);
    setImportError(null);
    setImportProgress({ completed: 0, total: droppedFiles.length || filePaths.length });

    void (async () => {
      const aggregateResult = createEmptyImportResult([...(importPreview?.failed ?? [])]);

      try {
        if (droppedFiles.length > 0) {
          for (let index = 0; index < droppedFiles.length; index += 1) {
            const file = droppedFiles[index];

            try {
              const source = await fileToDataImageSource(file);
              if (!source) {
                aggregateResult.failed.push({
                  filePath: file.name,
                  error: t('import.error.dropped_file_unsupported', {
                    defaultValue: 'Dropped file is not a supported image.',
                  }),
                });
                continue;
              }

              const result = await ipc.import.importRemoteImages({
                sources: [source],
                virtualFolderIds: [importFolderId],
              });
              mergeImportResult(aggregateResult, result);
            } catch (error) {
              aggregateResult.failed.push({
                filePath: file.name,
                error: getErrorMessage(
                  error,
                  t('import.error.import_dropped_file', {
                    defaultValue: 'Failed to import dropped file.',
                  }),
                ),
              });
            } finally {
              setImportProgress({ completed: index + 1, total: droppedFiles.length });
            }
          }
        } else {
          for (let index = 0; index < filePaths.length; index += 1) {
            const filePath = filePaths[index];

            try {
              const result = await ipc.import.importImages({
                filePaths: [filePath],
                virtualFolderIds: [importFolderId],
              });
              mergeImportResult(aggregateResult, result);
            } catch (error) {
              aggregateResult.failed.push({
                filePath,
                error: getErrorMessage(
                  error,
                  t('import.error.import_file', { defaultValue: 'Failed to import file.' }),
                ),
              });
            } finally {
              setImportProgress({ completed: index + 1, total: filePaths.length });
            }
          }
        }

        const processedCount = aggregateResult.imported + aggregateResult.reused;
        if (processedCount === 0 && aggregateResult.failed.length === 0) {
          setImportError(
            t('import.error.no_supported_images_imported', {
              defaultValue: 'No supported images were imported.',
            }),
          );
          setImportProgress(undefined);
          setImportStep('assets');
          return;
        }

        setImportSummary(createImportSummary(aggregateResult, destinationFolder));
        setImportPreview(undefined);
        setImportDroppedFiles(undefined);
        setImportProgress(undefined);
        setImportStep('completed');
        void onImported?.();
      } catch (error) {
        setImportError(
          getErrorMessage(
            error,
            t('import.error.import_assets', { defaultValue: 'Failed to import assets.' }),
          ),
        );
        setImportProgress(undefined);
        setImportStep('assets');
      } finally {
        importInFlightRef.current = false;
        setIsImporting(false);
        setIsImportDragActive(false);
        importDomDragDepthRef.current = 0;
      }
    })();
  }, [folderById, importDroppedFiles, importFolderId, importPreview, onImported, t]);

  const handleSelectImportFiles = useCallback(() => {
    if (importInFlightRef.current || filePickerOpenRef.current) {
      return;
    }

    filePickerOpenRef.current = true;
    setIsFilePickerOpen(true);

    void (async () => {
      try {
        const selection = await open({
          multiple: true,
          directory: false,
          filters: [
            {
              name: t('import.supported_images', { defaultValue: 'Supported Images' }),
              extensions: SUPPORTED_IMPORT_EXTENSIONS,
            },
          ],
        });
        const selectedFilePaths = normalizeDialogSelection(selection);
        if (selectedFilePaths.length === 0) {
          return;
        }

        await previewImportFilePaths(selectedFilePaths);
      } catch (error) {
        setImportError(
          getErrorMessage(
            error,
            t('import.error.open_file_picker', { defaultValue: 'Failed to open file picker.' }),
          ),
        );
      } finally {
        filePickerOpenRef.current = false;
        setIsFilePickerOpen(false);
      }
    })();
  }, [previewImportFilePaths, t]);

  const handleSelectImportFolders = useCallback(() => {
    if (importInFlightRef.current || filePickerOpenRef.current) {
      return;
    }

    filePickerOpenRef.current = true;
    setIsFilePickerOpen(true);

    void (async () => {
      try {
        const selection = await open({
          multiple: true,
          directory: true,
          recursive: true,
        });
        const selectedFolderPaths = normalizeDialogSelection(selection);
        if (selectedFolderPaths.length === 0) {
          return;
        }

        await previewImportFilePaths(selectedFolderPaths);
      } catch (error) {
        setImportError(
          getErrorMessage(
            error,
            t('import.error.open_folder_picker', {
              defaultValue: 'Failed to open folder picker.',
            }),
          ),
        );
      } finally {
        filePickerOpenRef.current = false;
        setIsFilePickerOpen(false);
      }
    })();
  }, [previewImportFilePaths, t]);

  useEffect(() => {
    if (
      importStep !== 'assets' ||
      isImporting ||
      isImportPreviewing ||
      isFilePickerOpen ||
      importDropWarning
    ) {
      setIsImportDragActive(false);
      importDomDragDepthRef.current = 0;
      return undefined;
    }

    const handleDocumentDragEnter = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !hasFileDropData(dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      importDomDragDepthRef.current += 1;
      setIsImportDragActive(true);
    };

    const handleDocumentDragOver = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !hasFileDropData(dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dataTransfer.dropEffect = 'copy';
      setIsImportDragActive(true);
    };

    const handleDocumentDragLeave = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !hasFileDropData(dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      importDomDragDepthRef.current = Math.max(0, importDomDragDepthRef.current - 1);
      if (importDomDragDepthRef.current === 0) {
        setIsImportDragActive(false);
      }
    };

    const handleDocumentDrop = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !hasFileDropData(dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const source = createDroppedFileDataSource(dataTransfer);
      importDomDragDepthRef.current = 0;
      setIsImportDragActive(false);
      void previewImportDroppedFiles(source);
    };

    document.addEventListener('dragenter', handleDocumentDragEnter, true);
    document.addEventListener('dragover', handleDocumentDragOver, true);
    document.addEventListener('dragleave', handleDocumentDragLeave, true);
    document.addEventListener('drop', handleDocumentDrop, true);

    return () => {
      document.removeEventListener('dragenter', handleDocumentDragEnter, true);
      document.removeEventListener('dragover', handleDocumentDragOver, true);
      document.removeEventListener('dragleave', handleDocumentDragLeave, true);
      document.removeEventListener('drop', handleDocumentDrop, true);
      importDomDragDepthRef.current = 0;
    };
  }, [
    importDropWarning,
    importStep,
    isFilePickerOpen,
    isImportPreviewing,
    isImporting,
    previewImportDroppedFiles,
  ]);

  return {
    folders,
    folderId: importFolderId,
    step: importStep,
    error: importError,
    summary: importSummary,
    filePreview,
    progress: importProgress,
    importDropWarning,
    importBusy,
    isImporting,
    isImportPreviewing,
    isFilePickerOpen,
    isImportDragActive,
    hasImportSelection,
    canUseSelectedFolder,
    open: handleOpenImport,
    close: handleCloseImport,
    changeFolder: handleImportFolderChange,
    selectFolder: handleSelectImportFolder,
    selectFiles: handleSelectImportFiles,
    selectFolders: handleSelectImportFolders,
    importPreviewedFiles: handleImportPreviewedFiles,
    cancelLargeImportDrop: handleCancelLargeImportDrop,
    continueLargeImportDrop: handleContinueLargeImportDrop,
  };
}

export { DROP_IMAGE_WARNING_THRESHOLD };

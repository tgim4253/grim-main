import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '../../lib/format';
import { cx } from '../../shared/lib/cx';
import { getErrorMessage } from '../../shared/lib/error';
import { ipc } from '../../shared/lib/ipc';
import type {
  AssetListSource,
  ImportFailure,
  ImportPreviewResult,
  ImportResult,
  VirtualFolder,
} from '../../shared/types';
import { ExplorerPanel } from '../../features/library-explorer';
import {
  RecordsView,
  ReferencesView,
  SessionPresetSettingsView,
  TagSettingsView,
} from '../../features/library-workspace';
import {
  DropImportWarningModal,
  FolderSearchModal,
  ImportAssetsModal,
  ImportCompletedModal,
  type ImportSummary,
} from '../../features/library-workspace/import';
import {
  DROP_IMAGE_WARNING_THRESHOLD,
  collectSupportedDroppedImageFiles,
  createDroppedFileDataSource,
  fileToDataImageSource,
  formatDroppedImageFileWarnings,
  hasFileDropData,
  type DroppedFileDataSource,
  type DroppedImageFileCollection,
} from '../../features/library-workspace/import/dropFileData';
import {
  getDropImportWarning,
  useDropImportConfirmation,
} from '../../features/library-workspace/import/lib/dropImportConfirmation';
import { AppTopBar } from '../../ui/Header/AppTopBar';
import {
  MiniSidebarRail,
  type PrimaryRailAction,
  type PrimaryRailItem,
  type SecondaryRailAction,
} from '../../ui/Sidebar/MiniSidebarRail';
import { SidebarPanel } from '../../ui/Sidebar/SidebarPanel';
import { SettingsModal } from '../../features/settings';
import { useLibrarySidebarResize } from './model/useLibrarySidebarResize';
import { useLibraryExplorer } from './model/useLibraryExplorer';
import './library-page.css';

const SUPPORTED_IMPORT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'];

type ImportStep = 'folder' | 'assets' | 'completed';
type ImportProgressState = {
  completed: number;
  total: number;
};

function getSourceFolderId(source: AssetListSource) {
  return source.kind === 'folder' ? source.folderId : null;
}

function normalizeSelectedFilePaths(filePaths: readonly string[]) {
  return [...new Set(filePaths.map(filePath => filePath.trim()).filter(Boolean))];
}

function normalizeDialogSelection(selection: string | string[] | null) {
  if (!selection) {
    return [];
  }

  return Array.isArray(selection) ? selection : [selection];
}

function createImportSummary(
  result: ImportResult,
  destinationFolder: VirtualFolder,
): ImportSummary {
  const totalSize = result.assets.reduce((sum, asset) => sum + asset.fileSize, 0);

  return {
    importedCount: result.imported,
    reusedCount: result.reused,
    processedCount: result.imported + result.reused,
    failedCount: result.failed.length,
    totalSize: formatBytes(totalSize),
    destinationFolder: destinationFolder.fullPath || destinationFolder.name,
  };
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function formatPreviewFailureMessage(failedCount: number, t: Translate) {
  if (failedCount === 0) {
    return null;
  }

  return t('import.preview_failure_message', {
    count: failedCount,
    formattedCount: failedCount.toLocaleString(),
    defaultValue: '{{formattedCount}} items could not be reviewed and will be skipped.',
  });
}

function createEmptyImportResult(failed: ImportFailure[] = []): ImportResult {
  return {
    imported: 0,
    reused: 0,
    failed,
    assets: [],
  };
}

function mergeImportResult(target: ImportResult, source: ImportResult) {
  target.imported += source.imported;
  target.reused += source.reused;
  target.failed.push(...source.failed);
  target.assets.push(...source.assets);
}

export function LibraryPage() {
  const { t } = useTranslation('common');
  const sidebarResize = useLibrarySidebarResize();
  const explorer = useLibraryExplorer();
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = useState(0);
  const [importStep, setImportStep] = useState<ImportStep | null>(null);
  const [importFolderId, setImportFolderId] = useState<string | undefined>();
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | undefined>();
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | undefined>();
  const [importDroppedFiles, setImportDroppedFiles] = useState<readonly File[] | undefined>();
  const [importProgress, setImportProgress] = useState<ImportProgressState | undefined>();
  const [isImporting, setIsImporting] = useState(false);
  const [isImportPreviewing, setIsImportPreviewing] = useState(false);
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const [isImportDragActive, setIsImportDragActive] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
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
  const primaryItems: readonly PrimaryRailItem[] = [
    {
      icon: 'folder-open',
      label: t('library.title', { defaultValue: 'Library' }),
      action: 'toggle-sidebar-panel',
      active: sidebarResize.isSidebarPanelOpen,
    },
    {
      icon: 'history',
      label: t('library.result_preview', { defaultValue: 'Result Preview' }),
      action: 'open-search',
    },
    {
      icon: 'tag',
      label: t('tags.settings.title', { defaultValue: 'Tag Settings' }),
      action: 'open-tag-settings',
      active: explorer.workspaceView === 'tag-settings',
    },
    {
      icon: 'sliders-horizontal',
      label: t('presets.settings.title', { defaultValue: 'Preset Settings' }),
      action: 'open-preset-settings',
      active: explorer.workspaceView === 'preset-settings',
    },
  ];

  const handlePrimaryAction = (action: PrimaryRailAction) => {
    switch (action) {
      case 'toggle-sidebar-panel':
        sidebarResize.setIsSidebarPanelOpen(open => !open);
        break;
      case 'open-search':
        explorer.openRecentRecords();
        break;
      case 'open-tag-settings':
        explorer.setWorkspaceView('tag-settings');
        break;
      case 'open-preset-settings':
        explorer.setWorkspaceView('preset-settings');
        break;
    }
  };

  const handleSecondaryAction = (action: SecondaryRailAction) => {
    switch (action) {
      case 'open-settings':
        setIsSettingsModalOpen(true);
        break;
      case 'open-account':
        break;
    }
  };

  const getDefaultImportFolderId = useCallback(() => {
    const activeFolderId = getSourceFolderId(explorer.assetSource);

    if (activeFolderId && explorer.assignableFolderById.has(activeFolderId)) {
      return activeFolderId;
    }

    return undefined;
  }, [explorer.assetSource, explorer.assignableFolderById]);

  const handleOpenImport = useCallback(() => {
    if (explorer.isExplorerLoading) {
      return;
    }

    setImportFolderId(getDefaultImportFolderId());
    setImportSummary(undefined);
    setImportPreview(undefined);
    setImportDroppedFiles(undefined);
    setImportProgress(undefined);
    clearImportDropConfirmation();
    setImportError(explorer.assignableFolders.length > 0 ? null : noDestinationFoldersError);
    setImportStep('folder');
    setIsImportDragActive(false);
  }, [
    explorer.assignableFolders.length,
    clearImportDropConfirmation,
    getDefaultImportFolderId,
    explorer.isExplorerLoading,
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
      explorer.assignableFolders.length === 0
    ) {
      return;
    }

    setImportError(null);
  }, [explorer.assignableFolders.length, importError, importStep, noDestinationFoldersError]);

  const handleImportFolderChange = useCallback((folderId: string) => {
    setImportFolderId(folderId);
    setImportError(null);
  }, []);

  const handleSelectImportFolder = useCallback(() => {
    if (!importFolderId || !explorer.assignableFolderById.has(importFolderId)) {
      setImportError(
        t('import.error.select_destination_before_files', {
          defaultValue: 'Select a destination folder before choosing files.',
        }),
      );
      return;
    }

    setImportError(null);
    setImportStep('assets');
  }, [explorer.assignableFolderById, importFolderId]);

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

      const destinationFolder = explorer.assignableFolderById.get(importFolderId);
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
    [explorer.assignableFolderById, importFolderId, t],
  );

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

      const destinationFolder = explorer.assignableFolderById.get(importFolderId);
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
      explorer.assignableFolderById,
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

    const destinationFolder = explorer.assignableFolderById.get(importFolderId);
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
        setWorkspaceRefreshKey(current => current + 1);
        void explorer.loadExplorerSnapshot();
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
  }, [
    explorer.assignableFolderById,
    importDroppedFiles,
    importFolderId,
    importPreview,
    explorer.loadExplorerSnapshot,
    t,
  ]);

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

  const importBusy = isImporting || isImportPreviewing || importDropWarning !== null;
  const importFilePreview = importPreview
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

  return (
    <div className="app-shell library-page">
      <AppTopBar />

      <div className="app-horizontal library-page__layout">
        <div
          className={cx(
            'app-sidebar',
            'library-page__sidebar',
            !sidebarResize.isSidebarPanelOpen && 'library-page__sidebar--collapsed',
          )}
          style={sidebarResize.sidebarStyle}
        >
          <SidebarPanel
            rail={
              <MiniSidebarRail
                primaryItems={primaryItems}
                onPrimaryAction={handlePrimaryAction}
                onSecondaryAction={handleSecondaryAction}
              />
            }
            title={t('explorer.title', { defaultValue: 'Explorer' })}
            collapsed={!sidebarResize.isSidebarPanelOpen}
          >
            <ExplorerPanel
              nodes={explorer.explorerNodes}
              activeNodeId={explorer.activeExplorerNodeId}
              loading={explorer.isExplorerLoading}
              error={explorer.explorerError}
              importDisabled={explorer.isExplorerLoading}
              createFolderDisabled={explorer.isExplorerLoading}
              onNodeSelect={explorer.handleExplorerNodeSelect}
              onImport={handleOpenImport}
              onCreateFolder={explorer.handleCreateExplorerFolder}
              onRetry={() => void explorer.loadExplorerSnapshot()}
            />
          </SidebarPanel>
        </div>

        {sidebarResize.isSidebarPanelOpen ? (
          <div
            {...sidebarResize.splitterProps}
            aria-label={t('library.resize_sidebar_panel', {
              defaultValue: 'Resize sidebar panel',
            })}
            className="library-page__splitter"
          />
        ) : null}

        <main className="app-workspace library-page__workspace library-page__main-container">
          {explorer.workspaceView === 'records' ? (
            <RecordsView
              refreshKey={workspaceRefreshKey}
              onExplorerRefresh={explorer.loadExplorerSnapshot}
            />
          ) : explorer.workspaceView === 'tag-settings' ? (
            <TagSettingsView />
          ) : explorer.workspaceView === 'preset-settings' ? (
            <SessionPresetSettingsView />
          ) : (
            <ReferencesView
              source={explorer.assetSource}
              refreshKey={workspaceRefreshKey}
              onExplorerRefresh={explorer.loadExplorerSnapshot}
            />
          )}
        </main>
      </div>

      <FolderSearchModal
        open={importStep === 'folder'}
        folders={explorer.assignableFolders}
        folderId={importFolderId}
        onFolderChange={handleImportFolderChange}
        onClose={handleCloseImport}
        busy={isImporting}
        errorMessage={importError}
        onSelectFolder={handleSelectImportFolder}
        selectFolderDisabled={!importFolderId || !explorer.assignableFolderById.has(importFolderId)}
        folderDisabled={explorer.assignableFolders.length === 0}
      />
      <ImportAssetsModal
        open={importStep === 'assets'}
        folders={explorer.assignableFolders}
        folderId={importFolderId}
        onFolderChange={handleImportFolderChange}
        onClose={handleCloseImport}
        busy={importBusy}
        errorMessage={importError}
        onSelectFiles={handleSelectImportFiles}
        onSelectFolders={handleSelectImportFolders}
        onImport={handleImportPreviewedFiles}
        filePreview={importFilePreview}
        progress={importProgress}
        busyLabel={
          isImporting
            ? t('import.importing_assets', { defaultValue: 'Importing assets...' })
            : t('import.reviewing_files', { defaultValue: 'Reviewing files...' })
        }
        selectFilesDisabled={
          isFilePickerOpen ||
          isImportPreviewing ||
          isImporting ||
          !importFolderId ||
          !explorer.assignableFolderById.has(importFolderId)
        }
        selectFoldersDisabled={
          isFilePickerOpen ||
          isImportPreviewing ||
          isImporting ||
          !importFolderId ||
          !explorer.assignableFolderById.has(importFolderId)
        }
        importDisabled={
          (!importPreview && !importDroppedFiles?.length) ||
          !importFolderId ||
          !explorer.assignableFolderById.has(importFolderId)
        }
        dragActive={isImportDragActive}
      />
      <ImportCompletedModal
        open={importStep === 'completed'}
        summary={importSummary}
        folders={explorer.assignableFolders}
        folderId={importFolderId}
        onFolderChange={handleImportFolderChange}
        onClose={handleCloseImport}
        onDone={handleCloseImport}
        errorMessage={importError}
        folderDisabled
      />
      <DropImportWarningModal
        open={importDropWarning !== null}
        itemCount={importDropWarning?.itemCount}
        countIsExact={importDropWarning?.countIsExact}
        threshold={DROP_IMAGE_WARNING_THRESHOLD}
        onCancel={handleCancelLargeImportDrop}
        onContinue={handleContinueLargeImportDrop}
      />
      <SettingsModal
        open={isSettingsModalOpen}
        onClose={() => {
          setIsSettingsModalOpen(false);
        }}
      />
    </div>
  );
}

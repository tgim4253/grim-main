import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { getErrorMessage } from '@/shared/lib/error';
import { ipc } from '@/shared/lib/ipc';
import type { ImportPreviewResult, VirtualFolder } from '@/shared/types';
import { fileToDataImageSource } from '../dropFileData';
import {
  createEmptyImportResult,
  createImportSummary,
  mergeImportResult,
  type Translate,
} from './importSummary';
import type { ImportProgress, ImportStep, ImportSummary } from './types';

type UseImportExecutionOptions = {
  folderById: ReadonlyMap<string, VirtualFolder>;
  importFolderId?: string;
  importDroppedFiles?: readonly File[];
  importPreview?: ImportPreviewResult;
  importInFlightRef: RefObject<boolean>;
  importPreviewInFlightRef: RefObject<boolean>;
  onImported?: () => Promise<void> | void;
  resetImportDragState: () => void;
  setImportError: Dispatch<SetStateAction<string | null>>;
  setImportStep: Dispatch<SetStateAction<ImportStep | null>>;
  setImportSummary: Dispatch<SetStateAction<ImportSummary | undefined>>;
  setImportPreview: Dispatch<SetStateAction<ImportPreviewResult | undefined>>;
  setImportDroppedFiles: Dispatch<SetStateAction<readonly File[] | undefined>>;
  setImportProgress: Dispatch<SetStateAction<ImportProgress | undefined>>;
  setIsImporting: Dispatch<SetStateAction<boolean>>;
  t: Translate;
};

export function useImportExecution({
  folderById,
  importFolderId,
  importDroppedFiles,
  importPreview,
  importInFlightRef,
  importPreviewInFlightRef,
  onImported,
  resetImportDragState,
  setImportError,
  setImportStep,
  setImportSummary,
  setImportPreview,
  setImportDroppedFiles,
  setImportProgress,
  setIsImporting,
  t,
}: UseImportExecutionOptions) {
  return useCallback(() => {
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
        resetImportDragState();
      }
    })();
  }, [
    folderById,
    importDroppedFiles,
    importFolderId,
    importInFlightRef,
    importPreview,
    importPreviewInFlightRef,
    onImported,
    resetImportDragState,
    setImportDroppedFiles,
    setImportError,
    setImportPreview,
    setImportProgress,
    setImportStep,
    setImportSummary,
    setIsImporting,
    t,
  ]);
}

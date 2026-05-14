import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { getErrorMessage } from '@/shared/lib/error';
import { ipc } from '@/shared/lib/ipc';
import type { ImportPreviewResult, VirtualFolder } from '@/shared/types';
import { formatPreviewFailureMessage, type Translate } from './importSummary';
import { normalizeSelectedFilePaths } from './importSelection';
import type { ImportProgress, ImportStep, ImportSummary } from './types';

type UseImportFilePathPreviewOptions = {
  folderById: ReadonlyMap<string, VirtualFolder>;
  importFolderId?: string;
  importInFlightRef: RefObject<boolean>;
  importPreviewInFlightRef: RefObject<boolean>;
  setImportError: Dispatch<SetStateAction<string | null>>;
  setImportStep: Dispatch<SetStateAction<ImportStep | null>>;
  setImportSummary: Dispatch<SetStateAction<ImportSummary | undefined>>;
  setImportPreview: Dispatch<SetStateAction<ImportPreviewResult | undefined>>;
  setImportDroppedFiles: Dispatch<SetStateAction<readonly File[] | undefined>>;
  setImportProgress: Dispatch<SetStateAction<ImportProgress | undefined>>;
  setIsImportPreviewing: Dispatch<SetStateAction<boolean>>;
  resetImportDragState?: () => void;
  t: Translate;
};

export function useImportFilePathPreview({
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
  resetImportDragState,
  t,
}: UseImportFilePathPreviewOptions) {
  return useCallback(
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
        resetImportDragState?.();
      }
    },
    [
      folderById,
      importFolderId,
      importInFlightRef,
      importPreviewInFlightRef,
      setImportDroppedFiles,
      setImportError,
      setImportPreview,
      setImportProgress,
      setImportStep,
      setImportSummary,
      setIsImportPreviewing,
      resetImportDragState,
      t,
    ],
  );
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { getErrorMessage } from '@/shared/lib/error';
import type { ImportPreviewResult, VirtualFolder } from '@/shared/types';
import {
  collectSupportedDroppedImageFiles,
  createDroppedFileDataSource,
  formatDroppedImageFileWarnings,
  hasFileDropData,
  type DroppedFileDataSource,
  type DroppedImageFileCollection,
} from '../dropFileData';
import { getDropImportWarning, useDropImportConfirmation } from '../lib/dropImportConfirmation';
import type { Translate } from './importSummary';
import type { ImportProgress, ImportStep, ImportSummary } from './types';

type UseImportDragDropPreviewOptions = {
  folderById: ReadonlyMap<string, VirtualFolder>;
  importFolderId?: string;
  importStep: ImportStep | null;
  importInFlightRef: RefObject<boolean>;
  importPreviewInFlightRef: RefObject<boolean>;
  isImporting: boolean;
  isImportPreviewing: boolean;
  isFilePickerOpen: boolean;
  setImportError: Dispatch<SetStateAction<string | null>>;
  setImportStep: Dispatch<SetStateAction<ImportStep | null>>;
  setImportSummary: Dispatch<SetStateAction<ImportSummary | undefined>>;
  setImportPreview: Dispatch<SetStateAction<ImportPreviewResult | undefined>>;
  setImportDroppedFiles: Dispatch<SetStateAction<readonly File[] | undefined>>;
  setImportProgress: Dispatch<SetStateAction<ImportProgress | undefined>>;
  setIsImportPreviewing: Dispatch<SetStateAction<boolean>>;
  t: Translate;
};

export function useImportDragDropPreview({
  folderById,
  importFolderId,
  importStep,
  importInFlightRef,
  importPreviewInFlightRef,
  isImporting,
  isImportPreviewing,
  isFilePickerOpen,
  setImportError,
  setImportStep,
  setImportSummary,
  setImportPreview,
  setImportDroppedFiles,
  setImportProgress,
  setIsImportPreviewing,
  t,
}: UseImportDragDropPreviewOptions) {
  const [isImportDragActive, setIsImportDragActive] = useState(false);
  const importDomDragDepthRef = useRef(0);
  const {
    warning: importDropWarning,
    requestConfirmation: requestImportDropConfirmation,
    clearConfirmation: clearImportDropConfirmation,
    takePendingConfirmation: takePendingImportDropConfirmation,
    hasPendingConfirmation: hasPendingImportDropConfirmation,
  } = useDropImportConfirmation<DroppedFileDataSource>();

  const resetImportDragState = useCallback(() => {
    setIsImportDragActive(false);
    importDomDragDepthRef.current = 0;
  }, []);

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
    [
      setImportDroppedFiles,
      setImportError,
      setImportPreview,
      setImportProgress,
      setImportStep,
      setImportSummary,
      t,
    ],
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
        resetImportDragState();
      }
    },
    [
      applyImportDroppedFileCollection,
      folderById,
      hasPendingImportDropConfirmation,
      importFolderId,
      importInFlightRef,
      importPreviewInFlightRef,
      requestImportDropConfirmation,
      resetImportDragState,
      setImportDroppedFiles,
      setImportError,
      setImportPreview,
      setImportProgress,
      setImportStep,
      setImportSummary,
      setIsImportPreviewing,
      t,
    ],
  );

  const continueLargeImportDrop = useCallback(() => {
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
        resetImportDragState();
      }
    })();
  }, [
    applyImportDroppedFileCollection,
    importInFlightRef,
    importPreviewInFlightRef,
    resetImportDragState,
    setImportError,
    setImportProgress,
    setImportStep,
    setIsImportPreviewing,
    t,
    takePendingImportDropConfirmation,
  ]);

  const cancelLargeImportDrop = useCallback(() => {
    clearImportDropConfirmation();
    resetImportDragState();
  }, [clearImportDropConfirmation, resetImportDragState]);

  useEffect(() => {
    if (
      importStep !== 'assets' ||
      isImporting ||
      isImportPreviewing ||
      isFilePickerOpen ||
      importDropWarning
    ) {
      resetImportDragState();
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
      resetImportDragState();
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
    resetImportDragState,
  ]);

  return {
    clearImportDropConfirmation,
    hasPendingImportDropConfirmation,
    importDropWarning,
    isImportDragActive,
    cancelLargeImportDrop,
    continueLargeImportDrop,
    resetImportDragState,
  };
}

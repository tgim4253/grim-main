import { useCallback, useRef, useState, type RefObject } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { getErrorMessage } from '@/shared/lib/error';
import { SUPPORTED_IMPORT_EXTENSIONS, normalizeDialogSelection } from './importSelection';
import type { Translate } from './importSummary';

type UseImportDialogSelectionOptions = {
  importInFlightRef: RefObject<boolean>;
  previewImportFilePaths: (filePaths: readonly string[]) => Promise<void>;
  setImportError: (message: string | null) => void;
  t: Translate;
};

export function useImportDialogSelection({
  importInFlightRef,
  previewImportFilePaths,
  setImportError,
  t,
}: UseImportDialogSelectionOptions) {
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false);
  const filePickerOpenRef = useRef(false);

  const selectFiles = useCallback(() => {
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
  }, [importInFlightRef, previewImportFilePaths, setImportError, t]);

  const selectFolders = useCallback(() => {
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
  }, [importInFlightRef, previewImportFilePaths, setImportError, t]);

  return {
    filePickerOpenRef,
    isFilePickerOpen,
    selectFiles,
    selectFolders,
  };
}

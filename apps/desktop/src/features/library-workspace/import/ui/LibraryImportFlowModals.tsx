import { useTranslation } from 'react-i18next';
import { DropImportWarningModal } from '../DropImportWarningModal';
import { FolderSearchModal, ImportAssetsModal, ImportCompletedModal } from '../LibraryImportModals';
import {
  DROP_IMAGE_WARNING_THRESHOLD,
  type LibraryImportFlow,
} from '../model/useLibraryImportFlow';

export type LibraryImportFlowModalsProps = {
  flow: LibraryImportFlow;
};

export function LibraryImportFlowModals({ flow }: LibraryImportFlowModalsProps) {
  const { t } = useTranslation('common');

  return (
    <>
      <FolderSearchModal
        open={flow.step === 'folder'}
        folders={flow.folders}
        folderId={flow.folderId}
        onFolderChange={flow.changeFolder}
        onClose={flow.close}
        busy={flow.isImporting}
        errorMessage={flow.error}
        onSelectFolder={flow.selectFolder}
        selectFolderDisabled={!flow.canUseSelectedFolder}
        folderDisabled={flow.folders.length === 0}
      />
      <ImportAssetsModal
        open={flow.step === 'assets'}
        folders={flow.folders}
        folderId={flow.folderId}
        onFolderChange={flow.changeFolder}
        onClose={flow.close}
        busy={flow.importBusy}
        errorMessage={flow.error}
        onSelectFiles={flow.selectFiles}
        onSelectFolders={flow.selectFolders}
        onImport={flow.importPreviewedFiles}
        filePreview={flow.filePreview}
        progress={flow.progress}
        busyLabel={
          flow.isImporting
            ? t('import.importing_assets', { defaultValue: 'Importing assets...' })
            : t('import.reviewing_files', { defaultValue: 'Reviewing files...' })
        }
        selectFilesDisabled={
          flow.isFilePickerOpen ||
          flow.isImportPreviewing ||
          flow.isImporting ||
          !flow.canUseSelectedFolder
        }
        selectFoldersDisabled={
          flow.isFilePickerOpen ||
          flow.isImportPreviewing ||
          flow.isImporting ||
          !flow.canUseSelectedFolder
        }
        importDisabled={!flow.hasImportSelection || !flow.canUseSelectedFolder}
        dragActive={flow.isImportDragActive}
      />
      <ImportCompletedModal
        open={flow.step === 'completed'}
        summary={flow.summary}
        folders={flow.folders}
        folderId={flow.folderId}
        onFolderChange={flow.changeFolder}
        onClose={flow.close}
        onDone={flow.close}
        errorMessage={flow.error}
        folderDisabled
      />
      <DropImportWarningModal
        open={flow.importDropWarning !== null}
        itemCount={flow.importDropWarning?.itemCount}
        countIsExact={flow.importDropWarning?.countIsExact}
        threshold={DROP_IMAGE_WARNING_THRESHOLD}
        onCancel={flow.cancelLargeImportDrop}
        onContinue={flow.continueLargeImportDrop}
      />
    </>
  );
}

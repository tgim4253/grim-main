import type {
  AssetDetail,
  CroquisRecordDetail,
  LibrarySnapshot,
  SaveVirtualFolderPayload,
  VirtualFolder,
} from '../../../shared/types';
import {
  FolderEditorModal,
  type FolderEditorState,
} from '../../../features/library/modals/FolderEditorModal';
import { FolderSelectionModal } from '../../../features/library/modals/FolderSelectionModal';
import { TagSelectionModal } from '../../../features/library/modals/TagSelectionModal';
import { CroquisStartModal } from '../../../features/croquis/ui/CroquisStartModal';

type ImportPlan = {
  mode: 'import' | 'link';
  filePaths: string[];
  initialFolderIds: string[];
};

type LibraryPageModalsProps = {
  assetFolderTarget: AssetDetail | null;
  assetTagTarget: AssetDetail | null;
  croquisOpen: boolean;
  folderEditor: FolderEditorState | null;
  folders: VirtualFolder[];
  importPlan: ImportPlan | null;
  onCloseAssetFolderTarget: () => void;
  onCloseAssetTagTarget: () => void;
  onCloseCroquis: () => void;
  onCloseFolderEditor: () => void;
  onCloseImportPlan: () => void;
  onCloseRecordTagTarget: () => void;
  onConfirmAssetFolders: (folderIds: string[]) => Promise<void>;
  onConfirmAssetTags: (tagIds: string[]) => Promise<void>;
  onConfirmImportPlan: (folderIds: string[]) => Promise<void>;
  onConfirmRecordTags: (tagIds: string[]) => Promise<void>;
  onCroquisStarted: () => Promise<void>;
  onSaveFolderEditor: (payload: SaveVirtualFolderPayload) => Promise<void>;
  recordTagTarget: CroquisRecordDetail | null;
  selectedAssetIds: string[];
  snapshot: LibrarySnapshot;
};

export function LibraryPageModals({
  assetFolderTarget,
  assetTagTarget,
  croquisOpen,
  folderEditor,
  folders,
  importPlan,
  onCloseAssetFolderTarget,
  onCloseAssetTagTarget,
  onCloseCroquis,
  onCloseFolderEditor,
  onCloseImportPlan,
  onCloseRecordTagTarget,
  onConfirmAssetFolders,
  onConfirmAssetTags,
  onConfirmImportPlan,
  onConfirmRecordTags,
  onCroquisStarted,
  onSaveFolderEditor,
  recordTagTarget,
  selectedAssetIds,
  snapshot,
}: LibraryPageModalsProps) {
  return (
    <>
      <FolderSelectionModal
        open={importPlan !== null}
        title={importPlan?.mode === 'link' ? 'Link External Files' : 'Import Images'}
        description={
          importPlan?.mode === 'link'
            ? 'Choose which virtual folders should reference these external work files.'
            : 'Select one or more virtual folders for the imported images. Leaving all folders unchecked keeps them uncategorized.'
        }
        folders={folders}
        initialSelectedIds={importPlan?.initialFolderIds ?? []}
        onClose={onCloseImportPlan}
        onConfirm={onConfirmImportPlan}
      />

      <FolderSelectionModal
        open={assetFolderTarget !== null}
        title="Assign Virtual Folders"
        description="Update the folder mapping for this asset. Zero folders keeps it in the uncategorized system view."
        folders={folders}
        initialSelectedIds={assetFolderTarget?.virtualFolders.map(folder => folder.id) ?? []}
        onClose={onCloseAssetFolderTarget}
        onConfirm={onConfirmAssetFolders}
      />

      <TagSelectionModal
        open={assetTagTarget !== null}
        title="Assign Asset Tags"
        description="Choose the tags that describe this reference asset."
        tags={snapshot.tags}
        tagGroups={snapshot.tagGroups}
        initialSelectedIds={assetTagTarget?.tags.map(tag => tag.id) ?? []}
        onClose={onCloseAssetTagTarget}
        onConfirm={onConfirmAssetTags}
      />

      <TagSelectionModal
        open={recordTagTarget !== null}
        title="Assign Record Tags"
        description="Choose the tags that describe this croquis record."
        tags={snapshot.tags}
        tagGroups={snapshot.tagGroups}
        initialSelectedIds={recordTagTarget?.tags.map(tag => tag.id) ?? []}
        onClose={onCloseRecordTagTarget}
        onConfirm={onConfirmRecordTags}
      />

      <FolderEditorModal
        open={folderEditor !== null}
        state={folderEditor}
        folders={folders}
        onClose={onCloseFolderEditor}
        onSave={onSaveFolderEditor}
      />

      <CroquisStartModal
        open={croquisOpen}
        assetIds={selectedAssetIds}
        sessionPresets={snapshot.sessionPresets}
        librarySettings={snapshot.settings}
        onClose={onCloseCroquis}
        onStarted={onCroquisStarted}
      />
    </>
  );
}

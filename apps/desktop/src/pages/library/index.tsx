import { AppLayout } from '../../ui/AppLayout/AppLayout';
import { Button } from '../../shared/ui';
import { LibrarySidebar } from '../../features/library/components/LibrarySidebar';
import { PanelWorkspace } from '../../features/library/components/PanelWorkspace';
import { labelForSelection } from '../../features/library/lib/helpers';
import { LibraryPageHeader } from './components/LibraryPageHeader';
import { LibraryPageModals } from './components/LibraryPageModals';
import { useLibraryPageController } from './lib/useLibraryPageController';
import './styles/library.chrome.css';
import './styles/library.workspace.css';
import './styles/library.manager.css';

export function LibraryPage() {
  const controller = useLibraryPageController();

  if (controller.loading && !controller.snapshot) {
    return <div className="app-empty-state">Initialising Croquis library...</div>;
  }

  if (controller.error || !controller.snapshot) {
    return (
      <div className="app-empty-state">
        <div className="library-bootstrap-error">
          <h1>Library bootstrap failed</h1>
          <p>{controller.error}</p>
          <Button variant="primary" onClick={() => void controller.refreshSnapshot()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const snapshot = controller.snapshot;
  const currentScopeLabel = labelForSelection(
    controller.selectedItem,
    snapshot.explorer.virtualFolders,
  );

  return (
    <>
      <AppLayout
        header={
          <LibraryPageHeader
            allAssetsCount={snapshot.explorer.allAssetsCount}
            currentScopeLabel={currentScopeLabel}
            sessionPresetCount={snapshot.sessionPresets.length}
            selectedAssetCount={controller.selectedAssetIds.length}
            uncategorizedCount={snapshot.explorer.uncategorizedCount}
            onCreateManualRecord={controller.createManualRecord}
            onLaunchExternalLink={controller.launchExternalLink}
            onLaunchImageImport={controller.launchImageImport}
            onOpenSessionPresetManager={controller.openSessionPresetManager}
            onOpenTagManager={controller.openTagManager}
            onOpenCroquis={controller.openCroquis}
          />
        }
        sidebar={
          <LibrarySidebar
            snapshot={snapshot}
            onOpenGrid={controller.openGrid}
            onOpenRecord={controller.openRecord}
            onOpenSession={controller.openSessionDetail}
            onNewFolder={controller.openNewFolderEditor}
            onEditSelectedFolder={controller.openSelectedFolderEditor}
            onDeleteSelectedFolder={() => void controller.deleteSelectedFolder()}
          />
        }
      >
        <section className="library-page app-page">
          <PanelWorkspace
            tabs={controller.tabs}
            activeTabId={controller.activeTabId}
            refreshToken={controller.refreshToken}
            onOpenAsset={controller.openAsset}
            onOpenAssetById={controller.openAssetById}
            onOpenRecord={controller.openRecord}
            onOpenFolderPicker={controller.openAssetFolderPicker}
            onOpenAssetTagPicker={controller.openAssetTagPicker}
            onOpenRecordTagPicker={controller.openRecordTagPicker}
            onDeleteRecord={controller.deleteRecordAndRefresh}
            onDataChanged={controller.refreshSnapshot}
            tagGroups={snapshot.tagGroups}
            tags={snapshot.tags}
          />
        </section>
      </AppLayout>

      <LibraryPageModals
        assetFolderTarget={controller.assetFolderTarget}
        assetTagTarget={controller.assetTagTarget}
        croquisOpen={controller.croquisOpen}
        folderEditor={controller.folderEditor}
        folders={controller.folders}
        importPlan={controller.importPlan}
        onCloseAssetFolderTarget={() => {
          controller.openAssetFolderPicker(null);
        }}
        onCloseAssetTagTarget={controller.closeTagTargets.asset}
        onCloseCroquis={controller.closeCroquis}
        onCloseFolderEditor={controller.closeFolderEditor}
        onCloseImportPlan={controller.closeImportPlan}
        onCloseRecordTagTarget={controller.closeTagTargets.record}
        onConfirmAssetFolders={controller.confirmAssetFolders}
        onConfirmAssetTags={controller.confirmAssetTags}
        onConfirmImportPlan={controller.confirmImportPlan}
        onConfirmRecordTags={controller.confirmRecordTags}
        onCroquisStarted={controller.handleCroquisStarted}
        onSaveFolderEditor={controller.saveFolderEditor}
        recordTagTarget={controller.recordTagTarget}
        selectedAssetIds={controller.selectedAssetIds}
        snapshot={snapshot}
      />
    </>
  );
}

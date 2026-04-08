import { Button } from '../../../shared/ui';

type LibraryPageHeaderProps = {
  allAssetsCount: number;
  currentScopeLabel: string;
  sessionPresetCount: number;
  selectedAssetCount: number;
  uncategorizedCount: number;
  onCreateManualRecord: () => Promise<void>;
  onLaunchExternalLink: () => Promise<void>;
  onLaunchImageImport: () => Promise<void>;
  onOpenSessionPresetManager: () => void;
  onOpenTagManager: () => void;
  onOpenCroquis: () => void;
};

export function LibraryPageHeader({
  allAssetsCount,
  currentScopeLabel,
  sessionPresetCount,
  selectedAssetCount,
  uncategorizedCount,
  onCreateManualRecord,
  onLaunchExternalLink,
  onLaunchImageImport,
  onOpenSessionPresetManager,
  onOpenTagManager,
  onOpenCroquis,
}: LibraryPageHeaderProps) {
  return (
    <>
      <div className="library-toolbar__brand">
        <div className="app-kicker">Single Library</div>
        <strong>Croquis Workspace</strong>
        <span className="library-toolbar__scope">
          Browsing <em>{currentScopeLabel}</em>
        </span>
      </div>

      <div className="library-toolbar__summary">
        <div className="library-toolbar__metrics" aria-label="Library summary">
          <span className="library-toolbar__metric">
            <strong>{String(allAssetsCount)}</strong>
            <span>assets</span>
          </span>
          <span className="library-toolbar__metric">
            <strong>{String(uncategorizedCount)}</strong>
            <span>uncategorized</span>
          </span>
          <span className="library-toolbar__metric">
            <strong>{String(sessionPresetCount)}</strong>
            <span>presets</span>
          </span>
        </div>
        <p className="library-toolbar__hint">
          {selectedAssetCount > 0
            ? `${String(selectedAssetCount)} assets are ready for the next croquis run.`
            : 'Select one or more assets from a grid to launch a croquis session.'}
        </p>
      </div>

      <div className="library-toolbar__actions">
        <Button variant="secondary" onClick={onOpenSessionPresetManager}>
          Session Presets
        </Button>
        <Button variant="secondary" onClick={onOpenTagManager}>
          Tags
        </Button>
        <Button variant="secondary" onClick={() => void onCreateManualRecord()}>
          New Record
        </Button>
        <Button variant="secondary" onClick={() => void onLaunchExternalLink()}>
          Link External
        </Button>
        <Button variant="secondary" onClick={() => void onLaunchImageImport()}>
          Import Images
        </Button>
        <Button variant="primary" disabled={selectedAssetCount === 0} onClick={onOpenCroquis}>
          {selectedAssetCount > 0
            ? `Start Croquis (${String(selectedAssetCount)})`
            : 'Start Croquis'}
        </Button>
      </div>
    </>
  );
}

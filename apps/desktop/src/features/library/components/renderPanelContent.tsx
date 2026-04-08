import type { PanelTab } from '../../../entities/library/model';
import type {
  AssetDetail,
  AssetSummary,
  CroquisRecordDetail,
  Tag,
  TagGroup,
} from '../../../shared/types';
import { AssetGridPanel } from '../panels/AssetGridPanel';
import { AssetViewerPanel } from '../panels/AssetViewerPanel';
import { RecordDetailPanel } from '../panels/RecordDetailPanel';
import { SessionDetailPanel } from '../panels/SessionDetailPanel';
import { SessionPresetManagerPanel } from '../panels/SessionPresetManagerPanel';
import { TagManagerPanel } from '../panels/TagManagerPanel';

type PanelContentRendererProps = {
  activeTab: PanelTab | null;
  refreshToken: number;
  onOpenAsset: (asset: AssetSummary) => void;
  onOpenAssetById: (assetId: string, title?: string) => void;
  onOpenRecord: (recordId: string, title?: string) => void;
  onOpenFolderPicker: (asset: AssetDetail) => void;
  onOpenAssetTagPicker: (asset: AssetDetail) => void;
  onOpenRecordTagPicker: (record: CroquisRecordDetail) => void;
  onDeleteRecord: (recordId: string) => void;
  onDataChanged: () => Promise<void>;
  tagGroups: TagGroup[];
  tags: Tag[];
};

export function renderPanelContent({
  activeTab,
  refreshToken,
  onOpenAsset,
  onOpenAssetById,
  onOpenRecord,
  onOpenFolderPicker,
  onOpenAssetTagPicker,
  onOpenRecordTagPicker,
  onDeleteRecord,
  onDataChanged,
  tagGroups,
  tags,
}: PanelContentRendererProps) {
  if (activeTab === null) {
    return <div className="library-panel-state">Open a view from the explorer to begin.</div>;
  }

  switch (activeTab.type) {
    case 'assetGrid':
      return (
        <AssetGridPanel tab={activeTab} refreshToken={refreshToken} onOpenAsset={onOpenAsset} />
      );
    case 'assetViewer':
      return (
        <AssetViewerPanel
          tab={activeTab}
          refreshToken={refreshToken}
          onOpenRecord={onOpenRecord}
          onOpenFolderPicker={onOpenFolderPicker}
          onOpenTagPicker={onOpenAssetTagPicker}
        />
      );
    case 'recordDetail':
      return (
        <RecordDetailPanel
          tab={activeTab}
          refreshToken={refreshToken}
          onOpenAsset={onOpenAssetById}
          onOpenTagPicker={onOpenRecordTagPicker}
          onDelete={onDeleteRecord}
        />
      );
    case 'sessionDetail':
      return (
        <SessionDetailPanel
          tab={activeTab}
          refreshToken={refreshToken}
          onOpenRecord={onOpenRecord}
        />
      );
    case 'sessionPresetManager':
      return (
        <SessionPresetManagerPanel
          refreshToken={refreshToken}
          tags={tags}
          onDataChanged={onDataChanged}
        />
      );
    case 'tagManager':
      return (
        <TagManagerPanel
          refreshToken={refreshToken}
          tagGroups={tagGroups}
          tags={tags}
          onDataChanged={onDataChanged}
        />
      );
  }
}

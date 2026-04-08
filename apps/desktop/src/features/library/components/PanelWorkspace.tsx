import { IconButton } from '../../../shared/ui';
import { cx } from '../../../shared/lib/cx';
import { useWorkspaceTabsStore, type PanelTab } from '../../../entities/library/model';
import type {
  AssetDetail,
  AssetSummary,
  CroquisRecordDetail,
  Tag,
  TagGroup,
} from '../../../shared/types';
import { renderPanelContent } from './renderPanelContent';

type PanelWorkspaceProps = {
  tabs: PanelTab[];
  activeTabId: string | null;
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

export function PanelWorkspace({
  tabs,
  activeTabId,
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
}: PanelWorkspaceProps) {
  const focusTab = useWorkspaceTabsStore(state => state.focusTab);
  const closeTab = useWorkspaceTabsStore(state => state.closeTab);

  const activeTab = tabs.find(tab => tab.id === activeTabId) ?? (tabs.length > 0 ? tabs[0] : null);

  return (
    <div className="workspace-shell">
      <div className="workspace-tabs">
        {tabs.map(tab => {
          const active = activeTab !== null && activeTab.id === tab.id;
          return (
            <div key={tab.id} className={cx('workspace-tab', active && 'workspace-tab--active')}>
              <button
                type="button"
                className="workspace-tab__label"
                onClick={() => {
                  focusTab(tab.id);
                }}
              >
                {tab.title}
              </button>
              <IconButton
                icon="close"
                size="md"
                aria-label={`Close ${tab.title}`}
                onClick={() => {
                  closeTab(tab.id);
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="workspace-body">
        {renderPanelContent({
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
        })}
      </div>
    </div>
  );
}

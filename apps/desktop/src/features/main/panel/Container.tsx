import { usePanelsStore } from '@tgim/stores/index';
import useFileTreeStore from '@tgim/stores/fileTreeStore';
import { Tab } from '@tgim/ui/index';
import { useCallback, useEffect } from 'react';
import Panels from './Panel';

interface Props {
  containerId: string;
}
const PanelContainer: React.FC<Props> = ({ containerId }) => {
  const panels = usePanelsStore(state => state.containers[containerId]?.panelIds || []);
  const focusedPanelId = usePanelsStore(state => state.containers[containerId]?.focusedPanelId);
  const setActivePanel = usePanelsStore(state => state.setActivePanel);
  const panelEntities = usePanelsStore(state => state.panelEntities);

  const syncSelectedNode = useCallback(
    (panelId: string | null | undefined) => {
      const { treeData, setSelectedNode, ensureVisible } = useFileTreeStore.getState();

      if (!panelId) {
        setSelectedNode(null);
        return;
      }

      const panel = panelEntities[panelId];
      if (!panel) {
        setSelectedNode(null);
        return;
      }

      const nodeId = String(panel.nodeId);

      if (!treeData.length) {
        setSelectedNode(nodeId);
        return;
      }

      const ancestors = ensureVisible(nodeId);
      if (!ancestors) {
        setSelectedNode(null);
        return;
      }

      setSelectedNode(nodeId);
    },
    [panelEntities],
  );

  const parsePanel = useCallback(
    (panelIds: string[]) => {
      return panelIds.map(panelId => {
        const panel = panelEntities[panelId];
        return {
          panelId: panel?.id ?? panelId,
          name: panel?.name ?? 'Untitled',
        };
      });
    },
    [panelEntities],
  );

  useEffect(() => {
    syncSelectedNode(focusedPanelId);
  }, [focusedPanelId, syncSelectedNode]);

  const handleSelectTab = useCallback(
    (id: string) => {
      setActivePanel(id);
      syncSelectedNode(id);
    },
    [setActivePanel, syncSelectedNode],
  );

  return (
    <div className="w-full h-full flex flex-col" id={containerId}>
      <Tab
        containerId={containerId}
        selectedTabId={focusedPanelId}
        tabs={parsePanel(panels)}
        onSelectTab={handleSelectTab}
      />
      <div className="flex-grow overflow-hidden">
        {panels.map(panel => (
          <Panels panelId={panel} key={panel} hidden={focusedPanelId !== panel} />
        ))}
      </div>
    </div>
  );
};

export default PanelContainer;

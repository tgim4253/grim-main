import { usePanelsStore } from '@tgim/stores/index';
import { Tab } from '@tgim/ui/index';
import { useShallow } from 'zustand/shallow';
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

  const parsePanel = useCallback(
    (panelIds: string[]) => {
      return panelIds.map(panelId => {
        const panel = panelEntities[panelId];
        return {
          panelId: panel.id,
          name: panel.name,
        };
      });
    },
    [panelEntities],
  );

  return (
    <div className="w-full h-full flex flex-col" id={containerId}>
      <Tab
        containerId={containerId}
        selectedTabId={focusedPanelId}
        tabs={parsePanel(panels)}
        onSelectTab={id => setActivePanel(id)}
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

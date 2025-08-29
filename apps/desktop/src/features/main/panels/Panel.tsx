import { usePanelsStore } from '@tgim/stores/index';
import { memo, useEffect, useState } from 'react';
import { shallow, useShallow } from 'zustand/shallow';
import ReactDOM from 'react-dom';

interface PanelProps {
  panelId: string;
  hidden?: boolean;
}

const Panel: React.FC<PanelProps> = ({ panelId, hidden }) => {
  const { panel, containerId, isActive } = usePanelsStore(
    useShallow(state => ({
      panel: state.panelEntities[panelId],
      containerId: state.panelOwnership[panelId],
      isActive: state.activePanelId === panelId,
    })),
  );

  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    console.log(panelId, 'created');
    if (containerId) {
      const el = document.getElementById(containerId);
      if (el) setContainer(el);
    }
  }, [containerId]);

  if (!panel || !container) return null;

  return ReactDOM.createPortal(
    <div
      className={`p-2 rounded border w-full h-full 
        ${isActive ? 'border-blue-500' : 'border-gray-300'} 
        ${hidden ? 'hidden' : ''}`}
    ></div>,
    container,
  );
};

export default memo(Panel);

import React from 'react';
import Button from './Button';
import cn from '@tgim/utils/cn';

interface TabProps {
  tabs: {
    panelId: string;
    name: string;
  }[];
  containerId: string;
  selectedTabId: string | undefined;
  onSelectTab: (id: string) => void;
  className?: string;
}

const Tab: React.FC<TabProps> = ({ tabs, containerId, selectedTabId, onSelectTab, className }) => {
  if (!selectedTabId) selectedTabId = tabs[0].panelId;
  return (
    <div className={cn('w-full overflow-x-scroll flex', className)}>
      {tabs.map(tab => (
        <Button
          variant="panel-tab"
          key={tab.panelId}
          onClick={() => onSelectTab(tab.panelId)}
          className={selectedTabId === tab.panelId ? 'selected' : ''}
        >
          {tab.name}
        </Button>
      ))}
    </div>
    // <Droppable id={containerId} variant="tabs">
    //   <SortableList
    //     items={tabs.map(tab => ({ id: tab.panelId, name: tab.name }))}
    //     containerId={containerId}
    //     strategy="horizontal"
    //     renderItem={(tab, index) => (
    //       <SortableItem handle={false} key={tab.id} id={tab.id} containerId={containerId}>
    //         <button
    //           key={tab.id}
    //           onClick={() => onSelectTab(tab.id)}
    //           style={{
    //             padding: '10px 20px',
    //             border: 'none',
    //             backgroundColor: tab.id === selectedTabId ? theme.colors.primary : 'transparent',
    //             color: tab.id === selectedTabId ? theme.colors.default : theme.colors.text,
    //             cursor: 'pointer',
    //             fontSize: theme.fontSizes.medium,
    //           }}
    //         >
    //           {tab.name}
    //         </button>
    //       </SortableItem>
    //     )}
    //   />
    // </Droppable>
  );
};

export default Tab;

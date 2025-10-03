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

const Tab: React.FC<TabProps> = ({ tabs, selectedTabId, onSelectTab, className }) => {
  if (!selectedTabId) selectedTabId = tabs[0].panelId;
  return (
    <div className={cn('flex w-full flex-nowrap overflow-x-auto space-x-2 pr-2', className)}>
      {tabs.map(tab => (
        <Button
          variant="panel-tab"
          key={tab.panelId}
          onClick={() => {
            onSelectTab(tab.panelId);
          }}
          className={selectedTabId === tab.panelId ? 'selected' : ''}
        >
          {tab.name}
        </Button>
      ))}
    </div>
  );
};

export default Tab;

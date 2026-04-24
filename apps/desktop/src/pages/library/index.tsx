import { useState } from 'react';
import { cx } from '../../shared/lib/cx';
import { AppTopBar } from '../../ui/Header/AppTopBar';
import {
  MiniSidebarRail,
  type PrimaryRailAction,
  type PrimaryRailItem,
} from '../../ui/Sidebar/MiniSidebarRail';
import { SidebarPanel } from '../../ui/Sidebar/SidebarPanel';
import './library-page.css';

export function LibraryPage() {
  const [isSidebarPanelOpen, setIsSidebarPanelOpen] = useState(true);

  const primaryItems: readonly PrimaryRailItem[] = [
    {
      icon: 'folder-open',
      label: 'Library',
      action: 'toggle-sidebar-panel',
      active: isSidebarPanelOpen,
    },
    {
      icon: 'search',
      label: 'Search',
      action: 'open-search',
    },
    {
      icon: 'grid',
      label: 'Grid',
      action: 'open-grid',
    },
    {
      icon: 'star',
      label: 'Favorites',
      action: 'open-favorites',
    },
  ];

  const handlePrimaryAction = (action: PrimaryRailAction) => {
    if (action === 'toggle-sidebar-panel') {
      setIsSidebarPanelOpen(open => !open);
    }
  };

  return (
    <div className="app-shell library-page">
      <AppTopBar />

      <div className="app-horizontal library-page__layout">
        <div
          className={cx(
            'app-sidebar',
            'library-page__sidebar',
            !isSidebarPanelOpen && 'library-page__sidebar--collapsed',
          )}
        >
          <SidebarPanel
            rail={
              <MiniSidebarRail primaryItems={primaryItems} onPrimaryAction={handlePrimaryAction} />
            }
            title="Explorer"
            collapsed={!isSidebarPanelOpen}
          />
        </div>

        <main className="app-workspace library-page__workspace" />
      </div>
    </div>
  );
}

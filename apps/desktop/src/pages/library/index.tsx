import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../shared/lib/cx';
import { useKeybindings } from '../../shared/hooks';
import { useShortcutFocusStore } from '../../shared/lib/keybindings';
import { ExplorerPanel, type ExplorerNode } from '../../features/library-explorer';
import {
  RecordsView,
  ReferencesView,
  SessionPresetSettingsView,
  TagSettingsView,
} from '../../features/library-workspace';
import {
  LibraryImportFlowModals,
  useLibraryImportFlow,
} from '../../features/library-workspace/import';
import { AppTopBar } from '../../ui/Header/AppTopBar';
import {
  MiniSidebarRail,
  type PrimaryRailAction,
  type PrimaryRailItem,
  type SecondaryRailAction,
} from '../../ui/Sidebar/MiniSidebarRail';
import { SidebarPanel } from '../../ui/Sidebar/SidebarPanel';
import { SettingsModal } from '../../features/settings';
import { useLibrarySidebarResize } from './model/useLibrarySidebarResize';
import { useLibraryExplorer } from './model/useLibraryExplorer';
import './library-page.css';

const focusActiveExplorerNode = () => {
  document
    .querySelector<HTMLElement>('.library-explorer [role="treeitem"][aria-selected="true"]')
    ?.focus();
};

const focusActiveExplorerNodeAfterPaint = () => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(focusActiveExplorerNode);
  });
};

export function LibraryPage() {
  const { t } = useTranslation('common');
  const sidebarResize = useLibrarySidebarResize();
  const explorer = useLibraryExplorer();
  const focusExplorerNode = useShortcutFocusStore(state => state.focusExplorerNode);
  const shortcutModalOpen = useShortcutFocusStore(state => state.modalDepth > 0);
  const setShortcutFocusArea = useShortcutFocusStore(state => state.setArea);
  const [workspaceRefreshKey, setWorkspaceRefreshKey] = useState(0);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const handleImported = useCallback(async () => {
    setWorkspaceRefreshKey(current => current + 1);
    await explorer.loadExplorerSnapshot();
  }, [explorer.loadExplorerSnapshot]);
  const importFlow = useLibraryImportFlow({
    folders: explorer.assignableFolders,
    folderById: explorer.assignableFolderById,
    assetSource: explorer.assetSource,
    explorerLoading: explorer.isExplorerLoading,
    onImported: handleImported,
  });
  const modalOpen = isSettingsModalOpen || importFlow.step !== null || shortcutModalOpen;

  useEffect(() => {
    switch (explorer.workspaceView) {
      case 'records':
        setShortcutFocusArea('records');
        break;
      case 'tag-settings':
        setShortcutFocusArea('tags');
        break;
      case 'preset-settings':
        setShortcutFocusArea('presets');
        break;
      case 'references':
        setShortcutFocusArea('references');
        break;
    }
  }, [explorer.workspaceView, setShortcutFocusArea]);

  const primaryItems: readonly PrimaryRailItem[] = [
    {
      icon: 'folder-open',
      label: t('library.title', { defaultValue: 'Library' }),
      action: 'toggle-sidebar-panel',
      active: sidebarResize.isSidebarPanelOpen,
    },
    {
      icon: 'history',
      label: t('library.result_preview', { defaultValue: 'Result Preview' }),
      action: 'open-search',
    },
    {
      icon: 'tag',
      label: t('tags.settings.title', { defaultValue: 'Tag Settings' }),
      action: 'open-tag-settings',
      active: explorer.workspaceView === 'tag-settings',
    },
    {
      icon: 'sliders-horizontal',
      label: t('presets.settings.title', { defaultValue: 'Preset Settings' }),
      action: 'open-preset-settings',
      active: explorer.workspaceView === 'preset-settings',
    },
  ];

  const handlePrimaryAction = (action: PrimaryRailAction) => {
    switch (action) {
      case 'toggle-sidebar-panel':
        sidebarResize.setIsSidebarPanelOpen(open => !open);
        break;
      case 'open-search':
        setShortcutFocusArea('records');
        explorer.openRecentRecords();
        break;
      case 'open-tag-settings':
        setShortcutFocusArea('tags');
        explorer.setWorkspaceView('tag-settings');
        break;
      case 'open-preset-settings':
        setShortcutFocusArea('presets');
        explorer.setWorkspaceView('preset-settings');
        break;
    }
  };

  const handleSecondaryAction = (action: SecondaryRailAction) => {
    switch (action) {
      case 'open-settings':
        setIsSettingsModalOpen(true);
        break;
      case 'open-account':
        break;
    }
  };

  const handleExplorerNodeSelect = useCallback(
    (node: ExplorerNode) => {
      explorer.handleExplorerNodeSelect(node);

      if (node.view === 'records') {
        setShortcutFocusArea('records');
        return;
      }

      if (node.source) {
        setShortcutFocusArea('references');
      }
    },
    [explorer.handleExplorerNodeSelect, setShortcutFocusArea],
  );

  useKeybindings({
    context: {
      captureOverlayOpen: false,
      libraryPage: true,
      modalOpen,
      referencesView: explorer.workspaceView === 'references',
    },
    handlers: {
      'grim.explorer.focus': () => {
        if (!sidebarResize.isSidebarPanelOpen) {
          sidebarResize.setIsSidebarPanelOpen(true);
        }

        focusExplorerNode(explorer.activeExplorerNodeId);
        focusActiveExplorerNodeAfterPaint();
      },
      'grim.explorer.import.open': () => {
        importFlow.open();
      },
      'grim.settings.open': () => {
        setIsSettingsModalOpen(true);
      },
      'grim.sidebar.toggle': () => {
        sidebarResize.setIsSidebarPanelOpen(open => !open);
      },
      'grim.view.presets': () => {
        setShortcutFocusArea('presets');
        explorer.setWorkspaceView('preset-settings');
      },
      'grim.view.records': () => {
        setShortcutFocusArea('records');
        explorer.openRecentRecords();
      },
      'grim.view.references': () => {
        setShortcutFocusArea('references');
        explorer.setWorkspaceView('references');
      },
      'grim.view.tags': () => {
        setShortcutFocusArea('tags');
        explorer.setWorkspaceView('tag-settings');
      },
    },
  });

  return (
    <div className="app-shell library-page">
      <AppTopBar />

      <div className="app-horizontal library-page__layout">
        <div
          className={cx(
            'app-sidebar',
            'library-page__sidebar',
            !sidebarResize.isSidebarPanelOpen && 'library-page__sidebar--collapsed',
          )}
          style={sidebarResize.sidebarStyle}
        >
          <SidebarPanel
            rail={
              <MiniSidebarRail
                primaryItems={primaryItems}
                onPrimaryAction={handlePrimaryAction}
                onSecondaryAction={handleSecondaryAction}
              />
            }
            title={t('explorer.title', { defaultValue: 'Explorer' })}
            collapsed={!sidebarResize.isSidebarPanelOpen}
          >
            <ExplorerPanel
              nodes={explorer.explorerNodes}
              activeNodeId={explorer.activeExplorerNodeId}
              loading={explorer.isExplorerLoading}
              error={explorer.explorerError}
              importDisabled={explorer.isExplorerLoading}
              createFolderDisabled={explorer.isExplorerLoading}
              onNodeSelect={handleExplorerNodeSelect}
              onImport={importFlow.open}
              onCreateFolder={explorer.handleCreateExplorerFolder}
              onRetry={() => void explorer.loadExplorerSnapshot()}
            />
          </SidebarPanel>
        </div>

        {sidebarResize.isSidebarPanelOpen ? (
          <div
            {...sidebarResize.splitterProps}
            aria-label={t('library.resize_sidebar_panel', {
              defaultValue: 'Resize sidebar panel',
            })}
            className="library-page__splitter"
          />
        ) : null}

        <main className="app-workspace library-page__workspace library-page__main-container">
          {explorer.workspaceView === 'records' ? (
            <RecordsView
              modalOpen={modalOpen}
              refreshKey={workspaceRefreshKey}
              onExplorerRefresh={explorer.loadExplorerSnapshot}
            />
          ) : explorer.workspaceView === 'tag-settings' ? (
            <TagSettingsView modalOpen={modalOpen} />
          ) : explorer.workspaceView === 'preset-settings' ? (
            <SessionPresetSettingsView modalOpen={modalOpen} />
          ) : (
            <ReferencesView
              modalOpen={modalOpen}
              source={explorer.assetSource}
              refreshKey={workspaceRefreshKey}
              onExplorerRefresh={explorer.loadExplorerSnapshot}
            />
          )}
        </main>
      </div>

      <LibraryImportFlowModals flow={importFlow} />
      <SettingsModal
        open={isSettingsModalOpen}
        onClose={() => {
          setIsSettingsModalOpen(false);
        }}
      />
    </div>
  );
}

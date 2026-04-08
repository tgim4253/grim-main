import { Button } from '../../../shared/ui';
import type { CroquisRecordSummary, LibrarySnapshot, SessionSummary } from '../../../shared/types';
import { cx } from '../../../shared/lib/cx';
import { useExplorerStore, type ExplorerSelection } from '../../../entities/library/model';
import { findFolderById, formatDateTime, recordLabel, sessionLabel } from '../lib/helpers';
import { LibraryFolderTree } from './LibraryFolderTree';
import { LibrarySidebarListSection } from './LibrarySidebarListSection';

type LibrarySidebarProps = {
  snapshot: LibrarySnapshot;
  onOpenGrid: (selection: ExplorerSelection) => void;
  onOpenRecord: (recordId: string, title?: string) => void;
  onOpenSession: (session: SessionSummary) => void;
  onNewFolder: () => void;
  onEditSelectedFolder: () => void;
  onDeleteSelectedFolder: () => void;
};

type SystemCardConfig = {
  key: string;
  label: string;
  copy: string;
  active: boolean;
  selection: ExplorerSelection;
};

function buildRecordMeta(record: CroquisRecordSummary) {
  return `${record.stepName ? `${record.stepName} · ` : ''}${formatDateTime(record.updatedAt)}`;
}

export function LibrarySidebar({
  snapshot,
  onOpenGrid,
  onOpenRecord,
  onOpenSession,
  onNewFolder,
  onEditSelectedFolder,
  onDeleteSelectedFolder,
}: LibrarySidebarProps) {
  const tree = useExplorerStore(state => state.tree);
  const selectedItem = useExplorerStore(state => state.selectedItem);
  const expandedFolderIds = useExplorerStore(state => state.expandedFolderIds);
  const setSelectedItem = useExplorerStore(state => state.setSelectedItem);
  const toggleFolder = useExplorerStore(state => state.toggleFolder);

  const selectedFolder = selectedItem.kind === 'folder' ? selectedItem.folderId : null;
  const selectedFolderNode = selectedFolder
    ? findFolderById(snapshot.explorer.virtualFolders, selectedFolder)
    : null;
  const systemCards: SystemCardConfig[] = [
    {
      key: 'all-assets',
      label: 'All Assets',
      copy: `${String(snapshot.explorer.allAssetsCount)} items`,
      active: selectedItem.kind === 'allAssets',
      selection: { kind: 'allAssets' },
    },
    {
      key: 'uncategorized',
      label: 'Uncategorized',
      copy: `${String(snapshot.explorer.uncategorizedCount)} items`,
      active: selectedItem.kind === 'uncategorized',
      selection: { kind: 'uncategorized' },
    },
  ];

  return (
    <div className="library-explorer">
      <div className="library-explorer__header">
        <div>
          <div className="app-kicker">Croquis</div>
          <h1 className="library-explorer__title">Library Explorer</h1>
          <p className="library-explorer__subtitle">
            Organise source material with virtual folders, then jump into records and sessions.
          </p>
        </div>
      </div>

      <div className="library-system-grid">
        {systemCards.map(item => (
          <button
            key={item.key}
            type="button"
            className={cx('library-system-card', item.active && 'library-system-card--active')}
            onClick={() => {
              onOpenGrid(item.selection);
            }}
          >
            <span className="app-kicker">System</span>
            <strong>{item.label}</strong>
            <span>{item.copy}</span>
          </button>
        ))}
      </div>

      <div className="library-explorer__folder-meta">
        <div className="app-kicker">Selected Folder</div>
        <strong>{selectedFolderNode?.fullPath ?? 'Library root'}</strong>
        <span>
          {selectedFolderNode
            ? 'New folders will be created inside this branch.'
            : 'Create top-level virtual folders here, or select one to manage its branch.'}
        </span>
      </div>

      <div className="library-explorer__actions">
        <Button variant="primary" width="fill" onClick={onNewFolder}>
          New Folder
        </Button>
        <Button
          variant="secondary"
          width="fill"
          disabled={!selectedFolder}
          onClick={onEditSelectedFolder}
        >
          Rename
        </Button>
        <Button
          variant="secondary"
          width="fill"
          disabled={!selectedFolder}
          onClick={onDeleteSelectedFolder}
        >
          Delete
        </Button>
      </div>

      <div className="library-explorer__body">
        <section className="library-explorer__section">
          <div className="library-section-heading">
            <div className="app-kicker">Virtual Folders</div>
            <span className="library-section-count">
              {String(snapshot.explorer.virtualFolders.length)}
            </span>
          </div>
          <LibraryFolderTree
            tree={tree}
            expandedFolderIds={expandedFolderIds}
            selectedItem={selectedItem}
            onToggle={toggleFolder}
            onOpen={folderId => {
              onOpenGrid({ kind: 'folder', folderId });
            }}
          />
        </section>

        <LibrarySidebarListSection
          title="Recent Records"
          count={snapshot.explorer.recentRecords.length}
          active={selectedItem.kind === 'recentRecords'}
          items={snapshot.explorer.recentRecords}
          emptyCopy="No records yet."
          getKey={record => record.id}
          getTitle={record => recordLabel(record)}
          getMeta={buildRecordMeta}
          isItemActive={record =>
            selectedItem.kind === 'record' && selectedItem.recordId === record.id
          }
          onActivate={() => {
            setSelectedItem({ kind: 'recentRecords' });
          }}
          onOpenItem={record => {
            setSelectedItem({ kind: 'record', recordId: record.id });
            onOpenRecord(record.id, recordLabel(record));
          }}
        />

        <LibrarySidebarListSection
          title="Sessions"
          count={snapshot.explorer.recentSessions.length}
          active={selectedItem.kind === 'sessions'}
          items={snapshot.explorer.recentSessions}
          emptyCopy="No sessions yet."
          getKey={session => session.id}
          getTitle={session => sessionLabel(session)}
          getMeta={session =>
            `${String(session.recordCount)} records · ${formatDateTime(session.createdAt)}`
          }
          isItemActive={session =>
            selectedItem.kind === 'session' && selectedItem.sessionId === session.id
          }
          onActivate={() => {
            setSelectedItem({ kind: 'sessions' });
          }}
          onOpenItem={session => {
            setSelectedItem({
              kind: 'session',
              sessionId: session.id,
              firstRecordId: session.firstRecordId ?? null,
            });
            onOpenSession(session);
          }}
        />
      </div>
    </div>
  );
}

import { useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Icon,
  IconButton,
  Input,
  Modal,
  ModalFooter,
  type ButtonSize,
  type ButtonVariant,
  type DualToneIconName,
  type StatusIconName,
  type StrokeIconName,
} from '../../shared/ui';
import { LibraryFolderTree } from '../../features/library/components/LibraryFolderTree';
import { LibrarySidebarListSection } from '../../features/library/components/LibrarySidebarListSection';
import type { ExplorerFolderNode, ExplorerSelection } from '../../entities/library/model';
import './styles/library.chrome.css';
import './styles/library.demo.css';

const BUTTON_VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive'];
const BUTTON_SIZES: ButtonSize[] = ['sm', 'md', 'lg'];
const STROKE_ICONS: StrokeIconName[] = [
  'layers',
  'tree',
  'camera',
  'reload',
  'setting',
  'plus',
  'link-2',
  'close',
];
const STATUS_ICONS: StatusIconName[] = ['brilliant', 'mistake', 'missed'];
const DUAL_ICONS: DualToneIconName[] = ['rapid', 'bullet'];

type DemoListItem = {
  id: string;
  title: string;
  meta: string;
};

const SAMPLE_TREE: ExplorerFolderNode[] = [
  {
    id: 'folder-body',
    parentId: null,
    name: 'Body',
    fullPath: '/Body',
    alias: null,
    sortOrder: 0,
    createdAt: '2026-04-09T10:00:00Z',
    updatedAt: '2026-04-09T10:00:00Z',
    depth: 0,
    children: [
      {
        id: 'folder-body-pose',
        parentId: 'folder-body',
        name: 'Pose',
        fullPath: '/Body/Pose',
        alias: null,
        sortOrder: 0,
        createdAt: '2026-04-09T10:00:00Z',
        updatedAt: '2026-04-09T10:00:00Z',
        depth: 1,
        children: [],
      },
      {
        id: 'folder-body-hands',
        parentId: 'folder-body',
        name: 'Hands',
        fullPath: '/Body/Hands',
        alias: null,
        sortOrder: 1,
        createdAt: '2026-04-09T10:00:00Z',
        updatedAt: '2026-04-09T10:00:00Z',
        depth: 1,
        children: [],
      },
    ],
  },
  {
    id: 'folder-clothing',
    parentId: null,
    name: 'Clothing',
    fullPath: '/Clothing',
    alias: null,
    sortOrder: 1,
    createdAt: '2026-04-09T10:00:00Z',
    updatedAt: '2026-04-09T10:00:00Z',
    depth: 0,
    children: [
      {
        id: 'folder-clothing-folds',
        parentId: 'folder-clothing',
        name: 'Folds',
        fullPath: '/Clothing/Folds',
        alias: null,
        sortOrder: 0,
        createdAt: '2026-04-09T10:00:00Z',
        updatedAt: '2026-04-09T10:00:00Z',
        depth: 1,
        children: [],
      },
    ],
  },
];

const SAMPLE_RECORDS: DemoListItem[] = [
  { id: 'record-1', title: '90s gesture warmup', meta: '3 min target · Today' },
  { id: 'record-2', title: 'Torso correction pass', meta: 'No result image · Today' },
  { id: 'record-3', title: 'Hands memory sketch', meta: 'Yesterday' },
];

const SAMPLE_SESSIONS: DemoListItem[] = [
  { id: 'session-1', title: 'Morning Gesture Loop', meta: '3 steps · 12 records' },
  { id: 'session-2', title: 'Hands Revision', meta: '2 steps · 4 records' },
];

type DemoCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

function DemoCard({ title, description, children, className }: DemoCardProps) {
  return (
    <section className={className ? `library-demo__card ${className}` : 'library-demo__card'}>
      <div className="library-demo__card-header">
        <h2 className="library-demo__card-title">{title}</h2>
        {description ? <p className="library-demo__card-description">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function LibraryDemoPage() {
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([
    'folder-body',
    'folder-clothing',
  ]);
  const [selectedItem, setSelectedItem] = useState<ExplorerSelection>({
    kind: 'folder',
    folderId: 'folder-body-pose',
  });
  const [activeExplorerSection, setActiveExplorerSection] = useState<'records' | 'sessions'>(
    'records',
  );
  const [activeListItemId, setActiveListItemId] = useState<string>('record-1');
  const [modalOpen, setModalOpen] = useState(false);

  const folderCount = useMemo(() => {
    let count = 0;
    const visit = (nodes: ExplorerFolderNode[]) => {
      for (const node of nodes) {
        count += 1;
        visit(node.children);
      }
    };
    visit(SAMPLE_TREE);
    return count;
  }, []);

  return (
    <>
      <section className="library-demo app-page">
        <header className="library-demo__header">
          <div className="app-kicker">Demo Surface</div>
          <h1 className="library-demo__heading">Croquis Component Demo</h1>
          <p className="library-demo__description">
            Chess-app 스타일의 데모 페이지 패턴으로, 현재 공용 UI와 라이브러리 순수 컴포넌트를 한
            화면에서 확인할 수 있게 묶어둔 상태입니다.
          </p>
        </header>

        <section className="library-demo__section">
          <div className="library-demo__section-heading">
            <div className="app-kicker">Shared UI</div>
            <h2 className="library-demo__section-title">Buttons, Inputs, Icons, Modal</h2>
          </div>

          <div className="library-demo__grid">
            <DemoCard title="Buttons" description="Variant and size checks for primary actions.">
              <div className="library-demo__stack">
                {BUTTON_VARIANTS.map(variant => (
                  <div key={variant} className="library-demo__row">
                    <span className="library-demo__label">{variant}</span>
                    <div className="library-demo__row library-demo__row--wrap">
                      {BUTTON_SIZES.map(size => (
                        <Button key={`${variant}-${size}`} variant={variant} size={size}>
                          {variant}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
                <Button width="fill" variant="secondary">
                  Full Width Action
                </Button>
              </div>
            </DemoCard>

            <DemoCard title="Inputs" description="Default, hint, destructive, disabled states.">
              <div className="library-demo__stack">
                <Input label="Session title" placeholder="Morning Gesture Loop" />
                <Input
                  label="Reference query"
                  placeholder="Search folders or tags"
                  hint="Use this block to test spacing and helper text."
                />
                <Input
                  label="Save path"
                  defaultValue="/Users/you/Pictures/croquis"
                  destructive
                  hint="Invalid path example."
                />
                <Input label="Locked field" defaultValue="Disabled preview" disabled />
              </div>
            </DemoCard>

            <DemoCard title="Icons" description="Stroke, status, and dual-tone glyphs.">
              <div className="library-demo__stack">
                <div className="library-demo__icon-grid">
                  {STROKE_ICONS.map(icon => (
                    <div key={icon} className="library-demo__icon-item">
                      <Icon name={icon} size="lg" />
                      <span>{icon}</span>
                    </div>
                  ))}
                </div>
                <div className="library-demo__row library-demo__row--wrap">
                  {STATUS_ICONS.map(icon => (
                    <div key={icon} className="library-demo__icon-pill">
                      <Icon name={icon} size="lg" />
                      <span>{icon}</span>
                    </div>
                  ))}
                  {DUAL_ICONS.map(icon => (
                    <div key={icon} className="library-demo__icon-pill">
                      <Icon name={icon} size="lg" color="white" />
                      <Icon name={icon} size="lg" color="black" />
                      <span>{icon}</span>
                    </div>
                  ))}
                </div>
              </div>
            </DemoCard>

            <DemoCard
              title="Icon Buttons + Modal"
              description="Interactive control cluster and inline modal preview."
            >
              <div className="library-demo__stack">
                <div className="library-demo__row library-demo__row--wrap">
                  <IconButton icon="tree" variant="sidebar" size="2xl" active />
                  <IconButton icon="layers" variant="sidebar" size="2xl" />
                  <IconButton icon="reload" size="lg" />
                  <IconButton icon="setting" size="lg" />
                  <IconButton icon="camera" size="lg" />
                </div>

                <div className="library-demo__row library-demo__row--wrap">
                  <Button
                    onClick={() => {
                      setModalOpen(true);
                    }}
                  >
                    Open Modal
                  </Button>
                  <Button variant="ghost">Secondary Action</Button>
                </div>

                <div className="library-demo__modal-preview">
                  <Modal
                    inline
                    open
                    title="Inline Modal Preview"
                    ariaLabel="Inline modal preview"
                    footer={
                      <ModalFooter layout="horizontal-right">
                        <Button variant="ghost" size="sm">
                          Cancel
                        </Button>
                        <Button size="sm">Save Preset</Button>
                      </ModalFooter>
                    }
                  >
                    <div className="library-demo__stack">
                      <Input label="Preset name" defaultValue="Gesture Ladder" />
                      <Input
                        label="Description"
                        defaultValue="1m -> 3m -> correction pass"
                        hint="This inline preview keeps the modal component visible without routing."
                      />
                    </div>
                  </Modal>
                </div>
              </div>
            </DemoCard>
          </div>
        </section>

        <section className="library-demo__section">
          <div className="library-demo__section-heading">
            <div className="app-kicker">Library Components</div>
            <h2 className="library-demo__section-title">Explorer primitives with sample data</h2>
          </div>

          <div className="library-demo__grid library-demo__grid--library">
            <DemoCard
              title="Folder Tree"
              description="Current pure tree component rendered with mock virtual folders."
            >
              <div className="library-demo__component-surface">
                <div className="library-demo__meta-row">
                  <span>{String(folderCount)} folders</span>
                  <span>
                    Selected:{' '}
                    {selectedItem.kind === 'folder' ? selectedItem.folderId : selectedItem.kind}
                  </span>
                </div>
                <LibraryFolderTree
                  tree={SAMPLE_TREE}
                  expandedFolderIds={expandedFolderIds}
                  selectedItem={selectedItem}
                  onToggle={(folderId: string) => {
                    setExpandedFolderIds(current =>
                      current.includes(folderId)
                        ? current.filter(id => id !== folderId)
                        : [...current, folderId],
                    );
                  }}
                  onOpen={(folderId: string) => {
                    setSelectedItem({ kind: 'folder', folderId });
                  }}
                />
              </div>
            </DemoCard>

            <DemoCard
              title="Sidebar Lists"
              description="Recent records and sessions preview using the shared list section."
            >
              <div className="library-demo__sidebar-preview">
                <LibrarySidebarListSection
                  title="Recent Records"
                  count={SAMPLE_RECORDS.length}
                  active={activeExplorerSection === 'records'}
                  items={SAMPLE_RECORDS}
                  emptyCopy="No records yet."
                  getKey={(item: DemoListItem) => item.id}
                  getTitle={(item: DemoListItem) => item.title}
                  getMeta={(item: DemoListItem) => item.meta}
                  isItemActive={(item: DemoListItem) =>
                    activeExplorerSection === 'records' && activeListItemId === item.id
                  }
                  onActivate={() => {
                    setActiveExplorerSection('records');
                  }}
                  onOpenItem={(item: DemoListItem) => {
                    setActiveExplorerSection('records');
                    setActiveListItemId(item.id);
                  }}
                />

                <LibrarySidebarListSection
                  title="Sessions"
                  count={SAMPLE_SESSIONS.length}
                  active={activeExplorerSection === 'sessions'}
                  items={SAMPLE_SESSIONS}
                  emptyCopy="No sessions yet."
                  getKey={(item: DemoListItem) => item.id}
                  getTitle={(item: DemoListItem) => item.title}
                  getMeta={(item: DemoListItem) => item.meta}
                  isItemActive={(item: DemoListItem) =>
                    activeExplorerSection === 'sessions' && activeListItemId === item.id
                  }
                  onActivate={() => {
                    setActiveExplorerSection('sessions');
                  }}
                  onOpenItem={(item: DemoListItem) => {
                    setActiveExplorerSection('sessions');
                    setActiveListItemId(item.id);
                  }}
                />
              </div>
            </DemoCard>
          </div>
        </section>
      </section>

      <Modal
        open={modalOpen}
        title="Live Modal"
        ariaLabel="Live modal demo"
        onClose={() => {
          setModalOpen(false);
        }}
        footer={
          <ModalFooter layout="horizontal-right">
            <Button
              variant="ghost"
              onClick={() => {
                setModalOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setModalOpen(false);
              }}
            >
              Confirm
            </Button>
          </ModalFooter>
        }
      >
        <div className="library-demo__stack">
          <p className="library-demo__modal-copy">
            This is the real portal modal instance for interaction checks.
          </p>
          <Input label="Preset name" defaultValue="Revision Loop" />
        </div>
      </Modal>
    </>
  );
}

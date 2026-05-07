import { useState, type ReactNode } from 'react';
import {
  ACCORDION_ROOT_TYPES,
  AccordionItem,
  AccordionItemBody,
  AccordionItemHeader,
  AccordionRoot,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  BUTTON_WIDTHS,
  Button,
  CHECKBOX_SIZES,
  Checkbox,
  CheckboxConditionalRow,
  CHECKBOX_ROW_WIDTHS,
  CheckboxRow,
  Chip,
  ChipButton,
  ICON_NAMES,
  Icon,
  IconButton,
  Input,
  MODAL_SIZES,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  type SelectOption,
  type ModalSize,
  type ButtonSize,
  type ButtonVariant,
  type ButtonWidth,
  type CheckboxRowWidth,
  type CheckboxSize,
  type ChipVariant,
  type AccordionRootType,
  type IconButtonSize,
  type IconColor,
  type IconHierarchy,
  type IconName,
  type IconSize,
  type SelectFilterOptions,
} from '../shared/ui';
import {
  FolderSearchModal,
  ImportAssetsModal,
  ImportCompletedModal,
} from '../features/library-workspace/import';
import { FolderSearchSelect } from '../features/library/components';
import { CroquisStartModal } from '../features/croquis/ui/CroquisStartModal';
import type { SessionPreset, TimeStepPreset, VirtualFolder } from '../shared/types';
import './uiDemo.css';

const DEMO_TIMESTAMP = '2024-01-01T00:00:00.000Z';
const FEATURED_ICONS: IconName[] = ['folder-open', 'anatomy', 'file', 'check', 'close'];
const SIZE_VARIANTS: IconSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];
const COLOR_VARIANTS: IconColor[] = ['text', 'brand'];
const HIERARCHY_VARIANTS: IconHierarchy[] = ['primary', 'tertiary'];
const BUTTON_SIZE_VARIANTS: ButtonSize[] = [...BUTTON_SIZES];
const BUTTON_VARIANT_VARIANTS: ButtonVariant[] = [...BUTTON_VARIANTS];
const BUTTON_WIDTH_VARIANTS: ButtonWidth[] = [...BUTTON_WIDTHS];
const CHECKBOX_SIZE_VARIANTS: CheckboxSize[] = [...CHECKBOX_SIZES];
const CHECKBOX_ROW_WIDTH_VARIANTS: CheckboxRowWidth[] = [...CHECKBOX_ROW_WIDTHS];
const ROUNDED_CHIP_VARIANTS = [
  'neutral-dismiss',
  'accent-outline',
  'accent-solid',
  'add',
] as const satisfies ChipVariant[];
const PILL_CHIP_VARIANTS = ['outline', 'selected'] as const satisfies ChipVariant[];
const ACCORDION_ROOT_VARIANTS: AccordionRootType[] = [...ACCORDION_ROOT_TYPES];
const MODAL_SIZE_VARIANTS: ModalSize[] = [...MODAL_SIZES];
const BUTTON_ICON_BUTTON_ROWS: Array<{
  icon: IconName;
  label: string;
  size: IconButtonSize;
  iconSize?: IconSize;
}> = [
  { icon: 'close', label: 'close / xs', size: 'xs' },
  { icon: 'reload', label: 'reload / md', size: 'md' },
  { icon: 'plus', label: 'plus / lg', size: 'lg' },
  { icon: 'close', label: 'close / sm', size: 'sm' },
  { icon: 'chevron-down', label: 'chevron-down / lg shell + sm icon', size: 'lg', iconSize: 'sm' },
  { icon: 'help-circle', label: 'help-circle / md', size: 'md' },
];
const SIDEBAR_ICON_BUTTON_ROWS: IconName[] = [
  'folder-open',
  'search',
  'grid',
  'star',
  'setting',
  'user',
  'tree',
];
const IMPORT_MODAL_PREVIEWS = [
  {
    id: 'folder-search',
    title: 'Folder Search',
    action: 'Open Folder Search',
    note: 'Select Folder header, search-style folder field, and two action footer.',
  },
  {
    id: 'import-assets',
    title: 'Import Assets',
    action: 'Open Import Assets',
    note: 'Drag-and-drop body with file affordance and Select Files action.',
  },
  {
    id: 'import-completed',
    title: 'Import Completed',
    action: 'Open Completed',
    note: 'Import summary, destination folder field, and Done action.',
  },
] as const;

type ImportModalPreview = (typeof IMPORT_MODAL_PREVIEWS)[number]['id'];
const CROQUIS_MODAL_ASSET_IDS = ['demo-asset-01', 'demo-asset-02', 'demo-asset-03'];
const CROQUIS_MODAL_TAGS = {
  gesture: {
    id: 'tag-gesture',
    groupId: 'group-study',
    name: 'GESTURE',
    color: '#26997b',
    sortOrder: 0,
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
  },
  pose: {
    id: 'tag-pose',
    groupId: 'group-study',
    name: 'POSE',
    color: '#667085',
    sortOrder: 1,
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
  },
  anatomy: {
    id: 'tag-anatomy',
    groupId: 'group-study',
    name: 'ANATOMY',
    color: '#7f56d9',
    sortOrder: 2,
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
  },
};
const CROQUIS_MODAL_TIME_STEP_PRESETS: TimeStepPreset[] = [
  {
    id: 'gesture-warmup-step',
    name: 'Warm-up Gestures',
    defaultDurationSeconds: 30,
    autoAdvance: true,
    recordSaveEnabled: true,
    captureEnabled: true,
    grayscaleEnabled: false,
    resultRequired: true,
    resultSavePath: null,
    autoTags: [CROQUIS_MODAL_TAGS.gesture],
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
  },
  {
    id: 'figure-study-step',
    name: 'Figure Study',
    defaultDurationSeconds: 90,
    autoAdvance: true,
    recordSaveEnabled: true,
    captureEnabled: true,
    grayscaleEnabled: false,
    resultRequired: true,
    resultSavePath: null,
    autoTags: [CROQUIS_MODAL_TAGS.pose],
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
  },
  {
    id: 'silhouette-step',
    name: 'Silhouette',
    defaultDurationSeconds: 120,
    autoAdvance: true,
    recordSaveEnabled: true,
    captureEnabled: false,
    grayscaleEnabled: false,
    resultRequired: false,
    resultSavePath: null,
    autoTags: [],
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
  },
  {
    id: 'anatomy-pass-step',
    name: 'Anatomy Pass',
    defaultDurationSeconds: 300,
    autoAdvance: true,
    recordSaveEnabled: true,
    captureEnabled: false,
    grayscaleEnabled: false,
    resultRequired: true,
    resultSavePath: null,
    autoTags: [CROQUIS_MODAL_TAGS.anatomy],
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
  },
];
const CROQUIS_MODAL_SESSION_PRESETS: SessionPreset[] = [
  {
    id: 'gesture-study',
    name: 'Gesture Study',
    description: 'Short pose warm-up with required result capture.',
    isDefault: true,
    windowWidth: '1080',
    windowHeight: '180',
    isShuffle: true,
    autoTags: [CROQUIS_MODAL_TAGS.gesture],
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
    steps: [
      {
        id: 'gesture-warmup',
        timeStepPresetId: 'gesture-warmup-step',
        stepOrder: 1,
        timeStep: CROQUIS_MODAL_TIME_STEP_PRESETS[0],
      },
      {
        id: 'figure-study',
        timeStepPresetId: 'figure-study-step',
        stepOrder: 2,
        timeStep: CROQUIS_MODAL_TIME_STEP_PRESETS[1],
      },
    ],
  },
  {
    id: 'long-pose',
    name: 'Long Pose',
    description: 'Longer study preset for anatomy passes.',
    isDefault: false,
    windowWidth: '960',
    windowHeight: null,
    isShuffle: false,
    autoTags: [CROQUIS_MODAL_TAGS.anatomy],
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
    steps: [
      {
        id: 'silhouette',
        timeStepPresetId: 'silhouette-step',
        stepOrder: 1,
        timeStep: CROQUIS_MODAL_TIME_STEP_PRESETS[2],
      },
      {
        id: 'anatomy-pass',
        timeStepPresetId: 'anatomy-pass-step',
        stepOrder: 2,
        timeStep: CROQUIS_MODAL_TIME_STEP_PRESETS[3],
      },
    ],
  },
];
const DEMO_VIRTUAL_FOLDERS: VirtualFolder[] = [
  {
    id: 'folder-references',
    parentId: null,
    name: 'References',
    fullPath: '/References',
    alias: null,
    kind: 'user',
    sortOrder: 0,
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
  },
  {
    id: 'folder-figure-study',
    parentId: 'folder-references',
    name: 'Figure Study',
    fullPath: '/References/Figure Study',
    alias: 'poses',
    kind: 'user',
    sortOrder: 1,
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
  },
  {
    id: 'folder-anatomy',
    parentId: 'folder-references',
    name: 'Anatomy',
    fullPath: '/References/Anatomy',
    alias: null,
    kind: 'user',
    sortOrder: 2,
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
  },
  {
    id: 'folder-croquis',
    parentId: null,
    name: 'Croquis Results',
    fullPath: '/Croquis Results',
    alias: 'practice',
    kind: 'user',
    sortOrder: 3,
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
  },
  {
    id: 'folder-uncategorized',
    parentId: null,
    name: 'Uncategorized',
    fullPath: '/Uncategorized',
    alias: null,
    kind: 'system_uncategorized',
    sortOrder: 4,
    createdAt: DEMO_TIMESTAMP,
    updatedAt: DEMO_TIMESTAMP,
  },
];

const BASIC_SELECT_OPTIONS: SelectOption[] = [
  { value: 'olivia', label: 'Olivia Rhye' },
  { value: 'phoenix', label: 'Phoenix Baker' },
  { value: 'lana', label: 'Lana Steiner' },
  { value: 'demi', label: 'Demi Wilkinson' },
  { value: 'candice', label: 'Candice Wu', disabled: true },
];

const MEMBER_SELECT_OPTIONS: SelectOption[] = [
  {
    value: 'olivia',
    label: 'Olivia Rhye',
    supportingText: '@olivia',
    menuLeading: <Icon name="user" size="md" hierarchy="tertiary" aria-hidden />,
    valueLeading: <span className="ui-demo__select-avatar">OR</span>,
  },
  {
    value: 'phoenix',
    label: 'Phoenix Baker',
    supportingText: '@phoenix',
    menuLeading: <Icon name="user" size="md" hierarchy="tertiary" aria-hidden />,
    valueLeading: <span className="ui-demo__select-avatar">PB</span>,
  },
  {
    value: 'lana',
    label: 'Lana Steiner',
    supportingText: '@lana',
    menuLeading: <Icon name="user" size="md" hierarchy="tertiary" aria-hidden />,
    valueLeading: <span className="ui-demo__select-avatar">LS</span>,
  },
  {
    value: 'demi',
    label: 'Demi Wilkinson',
    supportingText: '@demi',
    menuLeading: <Icon name="user" size="md" hierarchy="tertiary" aria-hidden />,
    valueLeading: <span className="ui-demo__select-avatar">DW</span>,
  },
  {
    value: 'natali',
    label: 'Natali Craig',
    supportingText: '@natali',
    menuLeading: <Icon name="user" size="md" hierarchy="tertiary" aria-hidden />,
    valueLeading: <span className="ui-demo__select-avatar">NC</span>,
    disabled: true,
  },
];

const filterSelectOptions: SelectFilterOptions = (query, options) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return options;
  }

  return options.filter(option => {
    const label = typeof option.label === 'string' ? option.label : option.value;
    const supportingText =
      typeof option.supportingText === 'string' ? option.supportingText : undefined;

    return [option.value, label, supportingText].some(text =>
      text?.toLocaleLowerCase().includes(normalizedQuery),
    );
  });
};

function DemoSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="ui-demo__section">
      <header className="ui-demo__section-header">
        <div className="app-kicker">Shared UI</div>
        <h2 className="ui-demo__section-title">{title}</h2>
        <p className="ui-demo__section-copy">{description}</p>
      </header>
      <div className="ui-demo__section-body">{children}</div>
    </section>
  );
}

function DemoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="ui-demo__card">
      <h3 className="ui-demo__card-title">{title}</h3>
      <div className="ui-demo__card-body">{children}</div>
    </article>
  );
}

function ToggleableChipButtonDemo() {
  const [pressed, setPressed] = useState(true);

  return (
    <div className="ui-demo__chip-button-toggle">
      <ChipButton
        shape="pill"
        variant="outline"
        pressed={pressed}
        onClick={() => {
          setPressed(current => !current);
        }}
      >
        Female
      </ChipButton>
      <span className="ui-demo__chip-button-hint">
        {pressed ? 'pressed' : 'rest'} · click to toggle
      </span>
    </div>
  );
}

function SelectDemo() {
  const [member, setMember] = useState('olivia');
  const [searchValue, setSearchValue] = useState('');
  const [folderId, setFolderId] = useState<string | undefined>();

  return (
    <>
      <DemoCard title="Trigger Types">
        <div className="ui-demo__select-grid">
          <div className="ui-demo__select-card">
            <div className="ui-demo__input-card-title">default</div>
            <Select
              label="Team member"
              placeholder="Select team member"
              options={BASIC_SELECT_OPTIONS}
              value={member}
              onValueChange={setMember}
            />
          </div>

          <div className="ui-demo__select-card">
            <div className="ui-demo__input-card-title">icon leading</div>
            <Select
              label="Team member"
              type="icon-leading"
              placeholder="Select team member"
              options={MEMBER_SELECT_OPTIONS}
              value={member}
              onValueChange={setMember}
            />
          </div>

          <div className="ui-demo__select-card">
            <div className="ui-demo__input-card-title">search</div>
            <Select
              label="Search"
              type="search"
              placeholder="Search team member"
              options={BASIC_SELECT_OPTIONS}
              value={searchValue}
              onValueChange={setSearchValue}
              filterOptions={filterSelectOptions}
              emptyMessage="No team members found"
            />
          </div>
        </div>
      </DemoCard>

      <DemoCard title="Open Menu">
        <div className="ui-demo__select-open-grid">
          <div className="ui-demo__select-card ui-demo__select-card--open">
            <div className="ui-demo__input-card-title">default / open</div>
            <Select
              defaultOpen
              label="Team member"
              placeholder="Select team member"
              options={BASIC_SELECT_OPTIONS}
              value={member}
              onValueChange={setMember}
            />
          </div>

          <div className="ui-demo__select-card ui-demo__select-card--open">
            <div className="ui-demo__input-card-title">icon leading / open</div>
            <Select
              defaultOpen
              label="Team member"
              type="icon-leading"
              placeholder="Select team member"
              options={MEMBER_SELECT_OPTIONS}
              value={member}
              onValueChange={setMember}
            />
          </div>
        </div>
      </DemoCard>

      <DemoCard title="Folder Search Select">
        <div className="ui-demo__select-card">
          <div className="ui-demo__input-card-title">virtual folder</div>
          <FolderSearchSelect
            label="Folder"
            placeholder="Search folders"
            folders={DEMO_VIRTUAL_FOLDERS}
            value={folderId}
            onValueChange={nextFolderId => {
              setFolderId(nextFolderId);
            }}
            emptyMessage="No folders found"
          />
        </div>
      </DemoCard>
    </>
  );
}

function AccordionDetailContent({ label, duration }: { label: string; duration: string }) {
  return (
    <div className="ui-demo__accordion-body-stack">
      <div className="ui-demo__accordion-chip-row">
        <Chip shape="rounded" variant="accent-outline">
          GESTURE
        </Chip>
        <Chip shape="rounded" variant="accent-solid">
          POSE
        </Chip>
        <Chip shape="rounded" variant="add">
          Add tag
        </Chip>
      </div>

      <Input label="Duration" defaultValue={duration} readOnly />

      <div className="ui-demo__accordion-checkbox-stack">
        <CheckboxRow label="Enable timer" defaultChecked width="full" />
        <CheckboxConditionalRow label="Shuffle queue" width="full">
          <div className="ui-demo__accordion-note">
            {label} detail stays mounted while the accordion collapses.
          </div>
        </CheckboxConditionalRow>
      </div>
    </div>
  );
}

function AccordionDemo() {
  const rootMeta: Record<AccordionRootType, { defaultValue: string | string[] | null }> = {
    single: { defaultValue: 'figure-studies' },
    multiple: { defaultValue: ['warm-up', 'figure-studies'] },
  };

  return (
    <div className="ui-demo__accordion-grid">
      {ACCORDION_ROOT_VARIANTS.map(type => (
        <div key={type} className="ui-demo__accordion-card">
          <div className="ui-demo__input-card-title">{type}</div>
          <AccordionRoot
            type={type}
            defaultValue={rootMeta[type].defaultValue}
            className="ui-demo__accordion-root"
          >
            <AccordionItem value="warm-up">
              <AccordionItemHeader index="01" meta="30s">
                Warm-up Gestures
              </AccordionItemHeader>
              <AccordionItemBody>
                <AccordionDetailContent label="Warm-up Gestures" duration="30 seconds" />
              </AccordionItemBody>
            </AccordionItem>

            <AccordionItem value="figure-studies">
              <AccordionItemHeader index="02" meta="60s">
                Figure Studies
              </AccordionItemHeader>
              <AccordionItemBody>
                <AccordionDetailContent label="Figure Studies" duration="60 seconds" />
              </AccordionItemBody>
            </AccordionItem>

            <AccordionItem value="silhouettes">
              <AccordionItemHeader index="03" meta="90s">
                Silhouettes
              </AccordionItemHeader>
              <AccordionItemBody>
                <AccordionDetailContent label="Silhouettes" duration="90 seconds" />
              </AccordionItemBody>
            </AccordionItem>
          </AccordionRoot>
        </div>
      ))}
    </div>
  );
}

function ModalDemo() {
  const [openSize, setOpenSize] = useState<ModalSize | null>(null);

  const handleClose = () => {
    setOpenSize(null);
  };

  const footer =
    openSize === 'lg' ? (
      <ModalFooter direction="vertical" alignment="fill">
        <Button variant="primary" width="fill" onClick={handleClose}>
          Start session
        </Button>
        <Button variant="secondary" width="fill" onClick={handleClose}>
          Cancel
        </Button>
      </ModalFooter>
    ) : openSize === 'md' ? (
      <ModalFooter
        direction="horizontal"
        alignment="end"
        leading={<CheckboxRow label="Auto-advance" defaultChecked />}
      >
        <Button size="lg" variant="secondary" onClick={handleClose}>
          Dismiss
        </Button>
        <Button size="lg" variant="primary" onClick={handleClose}>
          Continue
        </Button>
      </ModalFooter>
    ) : (
      <ModalFooter direction="horizontal" alignment="end">
        <Button size="lg" variant="secondary" onClick={handleClose}>
          Cancel
        </Button>
        <Button size="lg" variant="primary" onClick={handleClose}>
          Confirm
        </Button>
      </ModalFooter>
    );

  return (
    <>
      <DemoCard title="Launch Sizes">
        <div className="ui-demo__modal-launch-grid">
          {MODAL_SIZE_VARIANTS.map(size => (
            <div key={size} className="ui-demo__modal-launch-card">
              <div className="ui-demo__input-card-title">{size}</div>
              <div className="ui-demo__modal-launch-stack">
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => {
                    setOpenSize(size);
                  }}
                >
                  Open {size}
                </Button>
                <p className="ui-demo__modal-note">
                  {size === 'sm'
                    ? 'Horizontal end-aligned footer.'
                    : size === 'md'
                      ? 'Checkbox-leading footer with right-aligned actions.'
                      : 'Vertical stacked actions for dense flows.'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </DemoCard>

      <DemoCard title="Shell Notes">
        <div className="ui-demo__modal-meta-grid">
          <div className="ui-demo__modal-meta-card">
            <div className="ui-demo__input-card-title">header</div>
            <p className="ui-demo__modal-note">
              Title row with close affordance driven by the shared IconButton primitive.
            </p>
          </div>
          <div className="ui-demo__modal-meta-card">
            <div className="ui-demo__input-card-title">body</div>
            <p className="ui-demo__modal-note">
              Generic stacked body shell. Feature content should be composed inside.
            </p>
          </div>
          <div className="ui-demo__modal-meta-card">
            <div className="ui-demo__input-card-title">footer</div>
            <p className="ui-demo__modal-note">
              Supports fill and end alignment, plus the checkbox-leading footer variant from the
              Figma family.
            </p>
          </div>
        </div>
      </DemoCard>

      <Modal
        open={openSize !== null}
        size={openSize ?? 'sm'}
        aria-label={openSize ? `${openSize} modal preview` : undefined}
        header={
          openSize ? (
            <ModalHeader title={`Croquis session / ${openSize}`} onClose={handleClose} />
          ) : undefined
        }
        body={
          openSize ? (
            <ModalBody>
              <Input label="Session title" defaultValue="Figure Studies" />
              <div className="ui-demo__modal-chip-row">
                <Chip shape="rounded" variant="accent-outline">
                  GESTURE
                </Chip>
                <Chip shape="rounded" variant="accent-solid">
                  POSE
                </Chip>
              </div>
              <CheckboxRow width="full" defaultChecked label="Reuse active prompt seed" />
            </ModalBody>
          ) : undefined
        }
        footer={openSize ? footer : undefined}
        onClose={handleClose}
      />
    </>
  );
}

function ImportModalDemo() {
  const [openPreview, setOpenPreview] = useState<ImportModalPreview | null>(null);
  const [importFolderId, setImportFolderId] = useState<string | undefined>();
  const selectedImportFolder = DEMO_VIRTUAL_FOLDERS.find(folder => folder.id === importFolderId);

  const handleClose = () => {
    setOpenPreview(null);
  };

  return (
    <>
      <DemoCard title="Library Import Modals">
        <div className="ui-demo__modal-launch-grid">
          {IMPORT_MODAL_PREVIEWS.map(preview => (
            <div key={preview.id} className="ui-demo__modal-launch-card">
              <div className="ui-demo__input-card-title">{preview.title}</div>
              <div className="ui-demo__modal-launch-stack">
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => {
                    setOpenPreview(preview.id);
                  }}
                >
                  {preview.action}
                </Button>
                <p className="ui-demo__modal-note">{preview.note}</p>
              </div>
            </div>
          ))}
        </div>
      </DemoCard>

      <FolderSearchModal
        open={openPreview === 'folder-search'}
        folders={DEMO_VIRTUAL_FOLDERS}
        folderId={importFolderId}
        onFolderChange={nextFolderId => {
          setImportFolderId(nextFolderId);
        }}
        onClose={handleClose}
        onSelectFolder={() => {
          setOpenPreview('import-assets');
        }}
      />
      <ImportAssetsModal
        open={openPreview === 'import-assets'}
        folders={DEMO_VIRTUAL_FOLDERS}
        folderId={importFolderId}
        onFolderChange={nextFolderId => {
          setImportFolderId(nextFolderId);
        }}
        onClose={handleClose}
        onSelectFiles={() => {
          setOpenPreview('import-completed');
        }}
      />
      <ImportCompletedModal
        open={openPreview === 'import-completed'}
        summary={{
          importedCount: 14,
          reusedCount: 2,
          processedCount: 16,
          failedCount: 0,
          totalSize: '128.4 MB',
          destinationFolder: selectedImportFolder?.fullPath ?? 'Search directories...',
        }}
        folders={DEMO_VIRTUAL_FOLDERS}
        folderId={importFolderId}
        onFolderChange={nextFolderId => {
          setImportFolderId(nextFolderId);
        }}
        onClose={handleClose}
        onDone={handleClose}
      />
    </>
  );
}

function CroquisModalDemo() {
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);

  const handleClose = () => {
    setOpen(false);
  };

  const handleStarted = () => {
    setStarted(true);
    setOpen(false);
  };

  return (
    <>
      <DemoCard title="Croquis Start Modal">
        <div className="ui-demo__modal-launch-grid">
          <div className="ui-demo__modal-launch-card">
            <div className="ui-demo__input-card-title">start croquis</div>
            <div className="ui-demo__modal-launch-stack">
              <Button
                size="lg"
                variant="secondary"
                onClick={() => {
                  setStarted(false);
                  setOpen(true);
                }}
              >
                Open Start Croquis
              </Button>
              <p className="ui-demo__modal-note">
                Real croquis composition with mock assets, presets, and library settings.
              </p>
              {started ? (
                <p className="ui-demo__modal-note">Mock session started from the demo modal.</p>
              ) : null}
            </div>
          </div>
        </div>
      </DemoCard>

      <CroquisStartModal
        open={open}
        assetIds={CROQUIS_MODAL_ASSET_IDS}
        sessionPresets={CROQUIS_MODAL_SESSION_PRESETS}
        timeStepPresets={CROQUIS_MODAL_TIME_STEP_PRESETS}
        onClose={handleClose}
        onStarted={handleStarted}
        startCroquisSession={() => Promise.resolve()}
      />
    </>
  );
}

export function UiDemoPage() {
  return (
    <main className="ui-demo">
      <header className="ui-demo__hero">
        <div className="app-kicker">ui:demo</div>
        <h1 className="ui-demo__title">Grim Shared Section 8 Primitives</h1>
        <p className="ui-demo__copy">
          The shared UI layer now includes token-driven Button, Icon, IconButton, Checkbox, Chip,
          ChipButton, Input, Select, Accordion, and Modal primitives translated from the Section 8
          Figma library.
        </p>
      </header>

      <div className="ui-demo__grid">
        <DemoSection
          title="Accordion"
          description="Shared accordion shells translated from the updated Section 8 family. Single mode closes sibling items, while multiple mode allows independent expansion."
        >
          <DemoCard title="Root Behaviors">
            <AccordionDemo />
          </DemoCard>
        </DemoSection>

        <DemoSection
          title="Button"
          description="Primary, secondary, ghost, and destructive button variants mapped from the Section 8 family with size and width controls handled by live interaction states."
        >
          <DemoCard title="Variant Matrix">
            <div className="ui-demo__button-grid">
              {BUTTON_VARIANT_VARIANTS.map(variant => (
                <div key={variant} className="ui-demo__button-card">
                  <div className="ui-demo__button-card-title">{variant}</div>
                  <div className="ui-demo__button-stack">
                    {BUTTON_SIZE_VARIANTS.map(size => (
                      <Button key={`${variant}-${size}`} variant={variant} size={size}>
                        Button CTA
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </DemoCard>

          <DemoCard title="Width Options">
            <div className="ui-demo__button-width-grid">
              {BUTTON_WIDTH_VARIANTS.map(width => (
                <div key={width} className="ui-demo__button-width-card">
                  <div className="ui-demo__button-card-title">{width}</div>
                  <div className="ui-demo__button-width-sample">
                    <Button variant="primary" width={width}>
                      Button CTA
                    </Button>
                    <Button variant="secondary" width={width}>
                      Button CTA
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </DemoCard>
        </DemoSection>

        <DemoSection
          title="Catalog"
          description={`${String(ICON_NAMES.length)} shared glyphs rendered at the default md / text / primary combination.`}
        >
          <DemoCard title="Glyph Set">
            <div className="ui-demo__icon-grid">
              {ICON_NAMES.map(name => (
                <div key={name} className="ui-demo__icon-tile">
                  <Icon name={name} />
                  <span>{name}</span>
                </div>
              ))}
            </div>
          </DemoCard>
        </DemoSection>

        <DemoSection
          title="IconButton"
          description="Interactive button and sidebar primitives, now including the new xs close affordance. Hover, press, and focus the samples directly instead of rendering hardcoded state variants."
        >
          <DemoCard title="Button Playground">
            <div className="ui-demo__icon-button-playground">
              {BUTTON_ICON_BUTTON_ROWS.map(({ icon, label, size, iconSize }) => (
                <div key={label} className="ui-demo__icon-button-swatch">
                  <div className="ui-demo__icon-button-name">
                    <span className="ui-demo__icon-button-label">{icon}</span>
                    <span className="ui-demo__icon-button-meta">{label}</span>
                  </div>
                  <div className="ui-demo__icon-button-swatch-actions">
                    <IconButton icon={icon} size={size} iconSize={iconSize} aria-label={label} />
                    {icon === 'help-circle' ? (
                      <IconButton
                        icon={icon}
                        size={size}
                        iconSize={iconSize}
                        active
                        aria-label={`${label} active`}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </DemoCard>

          <DemoCard title="Sidebar Rail">
            <div className="ui-demo__sidebar-rail-demo">
              <div className="ui-demo__sidebar-rail">
                {SIDEBAR_ICON_BUTTON_ROWS.map(icon => (
                  <IconButton
                    key={icon}
                    icon={icon}
                    kind="sidebar"
                    active={icon === 'folder-open'}
                    iconColor={icon === 'folder-open' ? 'brand' : 'auto'}
                    aria-label={`${icon} sidebar action`}
                  />
                ))}
              </div>
              <div className="ui-demo__sidebar-legend">
                {SIDEBAR_ICON_BUTTON_ROWS.map(icon => (
                  <div key={icon} className="ui-demo__sidebar-legend-item">
                    <span className="ui-demo__icon-button-label">{icon}</span>
                    <span className="ui-demo__icon-button-meta">
                      {icon === 'folder-open' ? 'active' : 'interactive'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </DemoCard>
        </DemoSection>

        <DemoSection
          title="Checkbox"
          description="Primitive checkbox, inline row, and conditional row compositions mapped from the Section 8 Checkbox family."
        >
          <DemoCard title="Checkbox Scale">
            <div className="ui-demo__checkbox-grid">
              {CHECKBOX_SIZE_VARIANTS.map(size => (
                <div key={size} className="ui-demo__checkbox-card">
                  <div className="ui-demo__checkbox-card-title">{size}</div>
                  <div className="ui-demo__checkbox-card-body">
                    <div className="ui-demo__checkbox-pair">
                      <Checkbox size={size} aria-label={`${size} unchecked`} />
                      <Checkbox size={size} defaultChecked aria-label={`${size} checked`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DemoCard>

          <DemoCard title="Row Variants">
            <div className="ui-demo__checkbox-row-stack">
              {CHECKBOX_ROW_WIDTH_VARIANTS.map(width => (
                <div key={width} className="ui-demo__checkbox-width-card">
                  <div className="ui-demo__checkbox-card-title">{width}</div>
                  <div className="ui-demo__checkbox-width-sample">
                    <CheckboxRow width={width} size="sm" label="Snap guides to visible shapes" />
                    <CheckboxRow
                      width={width}
                      size="md"
                      label="Include background when exporting the croquis pass"
                    />
                    <CheckboxRow
                      width={width}
                      size="lg"
                      defaultChecked
                      label="Pin this option for the next session"
                    />
                  </div>
                </div>
              ))}
            </div>
          </DemoCard>

          <DemoCard title="Conditional Row">
            <div className="ui-demo__checkbox-conditional-demo">
              <CheckboxConditionalRow
                defaultChecked
                width="full"
                label="Generate follow-up passes after the first croquis render"
              >
                <CheckboxRow width="full" size="sm" defaultChecked label="Sharpen silhouettes" />
                <CheckboxRow width="full" size="sm" label="Keep the current canvas framing" />
                <CheckboxRow width="full" size="sm" label="Reuse the active prompt seed" />
              </CheckboxConditionalRow>
            </div>
          </DemoCard>
        </DemoSection>

        <DemoSection
          title="Chip"
          description="Rounded and pill chips mapped from the Section 8 Chip family, using the existing filter and croquis token groups."
        >
          <DemoCard title="Rounded Variants">
            <div className="ui-demo__chip-grid">
              {ROUNDED_CHIP_VARIANTS.map(variant => (
                <div key={variant} className="ui-demo__chip-card">
                  <div className="ui-demo__chip-card-title">{variant}</div>
                  <Chip shape="rounded" variant={variant}>
                    Female
                  </Chip>
                </div>
              ))}
            </div>
          </DemoCard>

          <DemoCard title="Pill Variants">
            <div className="ui-demo__chip-grid ui-demo__chip-grid--compact">
              {PILL_CHIP_VARIANTS.map(variant => (
                <div key={variant} className="ui-demo__chip-card">
                  <div className="ui-demo__chip-card-title">{variant}</div>
                  <Chip shape="pill" variant={variant}>
                    Female
                  </Chip>
                </div>
              ))}
            </div>
          </DemoCard>

          <DemoCard title="ChipButton">
            <div className="ui-demo__chip-grid">
              <div className="ui-demo__chip-card">
                <div className="ui-demo__chip-card-title">neutral-dismiss</div>
                <ChipButton variant="neutral-dismiss">Female</ChipButton>
              </div>
              <div className="ui-demo__chip-card">
                <div className="ui-demo__chip-card-title">add</div>
                <ChipButton variant="add">Female</ChipButton>
              </div>
              <div className="ui-demo__chip-card">
                <div className="ui-demo__chip-card-title">accent-outline</div>
                <ChipButton variant="accent-outline">Female</ChipButton>
              </div>
              <div className="ui-demo__chip-card">
                <div className="ui-demo__chip-card-title">accent-solid</div>
                <ChipButton variant="accent-solid">Female</ChipButton>
              </div>
              <div className="ui-demo__chip-card">
                <div className="ui-demo__chip-card-title">outline / rest</div>
                <ChipButton shape="pill" variant="outline">
                  Female
                </ChipButton>
              </div>
              <div className="ui-demo__chip-card">
                <div className="ui-demo__chip-card-title">outline / pressed</div>
                <ToggleableChipButtonDemo />
              </div>
            </div>
          </DemoCard>
        </DemoSection>

        <DemoSection
          title="Modal"
          description="Shared modal shell primitives with size options, footer layout variants, library import compositions, and the croquis start flow from the modal board."
        >
          <ModalDemo />
          <ImportModalDemo />
          <CroquisModalDemo />
        </DemoSection>

        <DemoSection
          title="Input"
          description="The shared input primitive maps the Section 8 label, hint, destructive, and state combinations while using live focus and disabled behavior."
        >
          <DemoCard title="Interactive Field States">
            <div className="ui-demo__input-grid">
              <div className="ui-demo__input-card">
                <div className="ui-demo__input-card-title">placeholder</div>
                <Input placeholder="olivia@untitledui.com" />
              </div>
              <div className="ui-demo__input-card">
                <div className="ui-demo__input-card-title">filled</div>
                <Input value="olivia@untitledui.com" readOnly />
              </div>
              <div className="ui-demo__input-card">
                <div className="ui-demo__input-card-title">focus me</div>
                <Input placeholder="olivia@untitledui.com" />
              </div>
              <div className="ui-demo__input-card">
                <div className="ui-demo__input-card-title">disabled</div>
                <Input value="olivia@untitledui.com" disabled readOnly />
              </div>
            </div>
          </DemoCard>

          <DemoCard title="Composed Variants">
            <div className="ui-demo__input-stack">
              <Input label="Email" placeholder="olivia@untitledui.com" />
              <Input
                label="Email"
                hint="This is a hint text to help user."
                placeholder="olivia@untitledui.com"
              />
              <Input label="Email" value="olivia@untitledui.com" readOnly />
              <Input
                label="Email"
                error="This is an error message."
                value="olivia@untitledui.com"
                readOnly
              />
            </div>
          </DemoCard>
        </DemoSection>

        <DemoSection
          title="Select"
          description="Default, icon-leading, and search select triggers mapped from the Section 8 Select family, with the menu now driven by canonical shared icons."
        >
          <SelectDemo />
        </DemoSection>

        <DemoSection
          title="Variants"
          description="Official size scale plus tone spot checks so the stroke-weight shift is visible across token sizes."
        >
          <DemoCard title="Scale Matrix">
            <div className="ui-demo__scale-table" role="table" aria-label="Icon scale matrix">
              <div className="ui-demo__scale-row ui-demo__scale-row--header" role="row">
                <div className="ui-demo__scale-name" role="columnheader">
                  icon
                </div>
                {SIZE_VARIANTS.map(size => (
                  <div key={size} className="ui-demo__scale-cell" role="columnheader">
                    {size}
                  </div>
                ))}
              </div>

              {ICON_NAMES.map(name => (
                <div key={name} className="ui-demo__scale-row" role="row">
                  <div className="ui-demo__scale-name" role="rowheader">
                    {name}
                  </div>
                  {SIZE_VARIANTS.map(size => (
                    <div key={`${name}-${size}`} className="ui-demo__scale-cell" role="cell">
                      <Icon
                        name={name}
                        size={size}
                        aria-label={`${name} ${size}`}
                        title={`${name} ${size}`}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </DemoCard>

          <DemoCard title="Tone Matrix">
            <div className="ui-demo__tone-grid">
              {FEATURED_ICONS.map(name => (
                <div key={name} className="ui-demo__tone-card">
                  <div className="ui-demo__tone-name">{name}</div>
                  <div className="ui-demo__tone-matrix">
                    {COLOR_VARIANTS.map(color =>
                      HIERARCHY_VARIANTS.map(hierarchy => (
                        <div key={`${name}-${color}-${hierarchy}`} className="ui-demo__tone-cell">
                          <Icon
                            name={name}
                            color={color}
                            hierarchy={hierarchy}
                            aria-label={`${name} ${color} ${hierarchy}`}
                          />
                          <span>{`${color}/${hierarchy}`}</span>
                        </div>
                      )),
                    )}
                  </div>
                </div>
              ))}
            </div>
          </DemoCard>
        </DemoSection>
      </div>
    </main>
  );
}

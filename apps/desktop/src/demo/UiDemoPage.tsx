import { useState, type ReactNode } from 'react';
import {
  AccordionItem,
  AccordionList,
  Avatar,
  Button,
  Checkbox,
  CheckboxConditionalRow,
  CheckboxRow,
  Chip,
  EditableAvatar,
  Icon,
  IconButton,
  Input,
  Logo,
  Modal,
  ModalFooter,
  Select,
  type SelectOption,
} from '../shared/ui';
import './uiDemo.css';

const AVATAR_SRC = `data:image/svg+xml;utf8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none">
    <rect width="160" height="160" rx="24" fill="#1B1B1B"/>
    <circle cx="80" cy="62" r="26" fill="#3EB282"/>
    <path d="M40 142c10-26 27-39 40-39s30 13 40 39" fill="#F4F1EF"/>
  </svg>
`)}`;

const DEFAULT_OPTIONS: SelectOption[] = [
  { value: 'croquis', label: 'Croquis Studio' },
  { value: 'capture', label: 'Capture Queue' },
  { value: 'archive', label: 'Archive' },
];

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

export function UiDemoPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [defaultSelectValue, setDefaultSelectValue] = useState<string | null>('croquis');
  const [checkboxEnabled, setCheckboxEnabled] = useState(true);

  return (
    <>
      <main className="ui-demo">
        <header className="ui-demo__hero">
          <div className="app-kicker">ui:demo</div>
          <h1 className="ui-demo__title">Grim Shared UI Shells</h1>
          <p className="ui-demo__copy">
            The shared UI layer now exposes unstyled primitives and placeholder structures only.
          </p>
        </header>

        <div className="ui-demo__grid">
          <DemoSection
            title="Forms"
            description="Bare controls with behavior preserved and visual variants removed."
          >
            <DemoCard title="Actions">
              <div className="ui-demo__row">
                <Button>Start Croquis</Button>
                <Button>Import</Button>
                <IconButton icon="help-circle" aria-label="Help" />
                <IconButton icon="folder-open" active aria-label="Explorer" />
              </div>
            </DemoCard>

            <DemoCard title="Inputs">
              <div className="ui-demo__stack">
                <Input label="Session name" placeholder="Leg extension practice" />
                <Input
                  label="Fallback timer"
                  hint="Used when the preset step does not define a value."
                  placeholder="30"
                  type="number"
                />
              </div>
            </DemoCard>

            <DemoCard title="Select">
              <div className="ui-demo__stack">
                <Select
                  label="Preset"
                  hint="Simple native select shell"
                  options={DEFAULT_OPTIONS}
                  value={defaultSelectValue}
                  onChange={setDefaultSelectValue}
                />
              </div>
            </DemoCard>
          </DemoSection>

          <DemoSection
            title="State"
            description="Minimal stateful controls and identity placeholders."
          >
            <DemoCard title="Checkboxes">
              <div className="ui-demo__stack">
                <div className="ui-demo__row">
                  <Checkbox defaultChecked />
                  <Checkbox />
                </div>
                <CheckboxRow
                  label="Enable capture"
                  checked={checkboxEnabled}
                  onCheckedChange={setCheckboxEnabled}
                />
                <CheckboxConditionalRow
                  label="Advanced timing"
                  checked={checkboxEnabled}
                  onCheckedChange={setCheckboxEnabled}
                >
                  <div className="ui-demo__stack ui-demo__stack--compact">
                    <CheckboxRow label="Auto skip on timeout" defaultChecked />
                    <CheckboxRow label="Show countdown overlay" />
                  </div>
                </CheckboxConditionalRow>
              </div>
            </DemoCard>

            <DemoCard title="Chips">
              <div className="ui-demo__row ui-demo__row--wrap">
                <Chip label="Female" />
                <Chip label="Gesture" />
                <Chip label="Add Tag" onClick={() => undefined} />
              </div>
            </DemoCard>

            <DemoCard title="Identity">
              <div className="ui-demo__row ui-demo__row--wrap">
                <Avatar />
                <Avatar src={AVATAR_SRC} alt="Demo avatar" />
                <EditableAvatar />
                <EditableAvatar src={AVATAR_SRC} alt="Editable demo avatar" />
                <Logo kind="chesscom" />
                <Logo kind="lichess" />
              </div>
            </DemoCard>

            <DemoCard title="Placeholders">
              <div className="ui-demo__row ui-demo__row--wrap">
                <Icon name="folder-open" />
                <Icon name="search" />
                <Icon name="setting" />
              </div>
            </DemoCard>

            <DemoCard title="Accordion">
              <AccordionList title="Time Steps Pipeline" countLabel="2 Steps Total">
                <AccordionItem index="01" title="Warm Up" tags={['Gesture']} value="30s" expanded>
                  <Input label="Step name" value="Warm Up" readOnly />
                </AccordionItem>
                <AccordionItem index="02" title="Long Pose" tags={['Pose']} value="2m" />
              </AccordionList>
            </DemoCard>
          </DemoSection>

          <DemoSection
            title="Modal"
            description="Interactive modal shell with structure and close behavior only."
          >
            <DemoCard title="Launch">
              <div className="ui-demo__stack">
                <p className="ui-demo__card-copy">
                  Open the modal to inspect the unstyled header, body, and footer structure.
                </p>
                <div className="ui-demo__row">
                  <Button
                    onClick={() => {
                      setModalOpen(true);
                    }}
                  >
                    Open Modal
                  </Button>
                </div>
              </div>
            </DemoCard>
          </DemoSection>
        </div>
      </main>

      <Modal
        open={modalOpen}
        title="Start Croquis"
        onClose={() => {
          setModalOpen(false);
        }}
        footer={
          <ModalFooter>
            <Button
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
              Start Session
            </Button>
          </ModalFooter>
        }
      >
        <Input label="Session name" placeholder="Leg Extension Practice" />
        <Select
          label="Preset"
          options={DEFAULT_OPTIONS}
          value={defaultSelectValue}
          onChange={setDefaultSelectValue}
        />
      </Modal>
    </>
  );
}

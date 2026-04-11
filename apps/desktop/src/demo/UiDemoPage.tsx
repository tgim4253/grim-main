import { useState, type ReactNode } from 'react';
import {
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
  Select,
  type SelectOption,
  type ButtonSize,
  type ButtonVariant,
  type ButtonWidth,
  type CheckboxRowWidth,
  type CheckboxSize,
  type ChipVariant,
  type IconButtonSize,
  type IconColor,
  type IconHierarchy,
  type IconName,
  type IconSize,
} from '../shared/ui';
import './uiDemo.css';

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
  const [searchValue, setSearchValue] = useState('olivia');

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
              placeholder="Search"
              options={BASIC_SELECT_OPTIONS}
              value={searchValue}
              onValueChange={setSearchValue}
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
          ChipButton, Input, and Select primitives translated from the Section 8 Figma library.
        </p>
      </header>

      <div className="ui-demo__grid">
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

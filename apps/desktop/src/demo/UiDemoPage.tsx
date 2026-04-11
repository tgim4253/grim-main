import type { ReactNode } from 'react';
import {
  ICON_NAMES,
  Icon,
  IconButton,
  type IconButtonSize,
  type IconColor,
  type IconHierarchy,
  type IconName,
  type IconSize,
} from '../shared/ui';
import './uiDemo.css';

const FEATURED_ICONS: IconName[] = ['folder-open', 'anatomy', 'file', 'chevron-up', 'close'];
const SIZE_VARIANTS: IconSize[] = ['xs', 'sm', 'md', 'lg', 'xl'];
const COLOR_VARIANTS: IconColor[] = ['text', 'brand'];
const HIERARCHY_VARIANTS: IconHierarchy[] = ['primary', 'tertiary'];
const BUTTON_ICON_BUTTON_ROWS: Array<{
  icon: IconName;
  label: string;
  size: IconButtonSize;
  iconSize?: IconSize;
}> = [
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
  return (
    <main className="ui-demo">
      <header className="ui-demo__hero">
        <div className="app-kicker">ui:demo</div>
        <h1 className="ui-demo__title">Grim Shared Icon Primitives</h1>
        <p className="ui-demo__copy">
          The shared UI layer now has token-driven icon and icon-button primitives based on the
          Section 8 Figma library.
        </p>
      </header>

      <div className="ui-demo__grid">
        <DemoSection
          title="Catalog"
          description="All 25 glyphs rendered at the default md / text / primary combination."
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
          description="Interactive button and sidebar primitives. Hover, press, and focus the samples directly instead of rendering hardcoded state variants."
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

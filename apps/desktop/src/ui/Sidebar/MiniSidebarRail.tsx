import { IconButton, type IconName } from '../../shared/ui';
import './mini-sidebar-rail.css';

export type PrimaryRailAction =
  | 'toggle-sidebar-panel'
  | 'open-search'
  | 'open-tag-settings'
  | 'open-preset-settings';
export type SecondaryRailAction = 'open-account' | 'open-settings';

export type PrimaryRailItem = {
  icon: IconName;
  label: string;
  action: PrimaryRailAction;
  active?: boolean;
  disabled?: boolean;
  iconColor?: 'brand';
  iconHierarchy?: 'primary';
};

export type SecondaryRailItem = {
  icon: 'user' | 'setting';
  label: string;
  action: SecondaryRailAction;
  disabled?: boolean;
};

type MiniSidebarRailProps = {
  primaryItems: readonly PrimaryRailItem[];
  secondaryItems?: readonly SecondaryRailItem[];
  onPrimaryAction?: (action: PrimaryRailAction, item: PrimaryRailItem) => void;
  onSecondaryAction?: (action: SecondaryRailAction, item: SecondaryRailItem) => void;
};

const DEFAULT_SECONDARY_ITEMS: readonly SecondaryRailItem[] = [
  {
    icon: 'user',
    label: 'Account',
    action: 'open-account',
  },
  {
    icon: 'setting',
    label: 'Settings',
    action: 'open-settings',
  },
];

export function MiniSidebarRail({
  primaryItems,
  secondaryItems = DEFAULT_SECONDARY_ITEMS,
  onPrimaryAction,
  onSecondaryAction,
}: MiniSidebarRailProps) {
  return (
    <aside className="mini-sidebar-rail" aria-label="Primary navigation">
      <nav className="mini-sidebar-rail__primary" aria-label="Library sections">
        {primaryItems.map(item => (
          <IconButton
            key={item.icon}
            aria-label={item.label}
            title={item.label}
            kind="sidebar"
            size="2xl"
            icon={item.icon}
            active={item.active}
            disabled={item.disabled}
            iconColor={item.iconColor}
            iconHierarchy={item.iconHierarchy}
            onClick={() => onPrimaryAction?.(item.action, item)}
          />
        ))}
      </nav>

      <div className="mini-sidebar-rail__spacer" aria-hidden="true" />

      <div className="mini-sidebar-rail__secondary" aria-label="Window utilities">
        {secondaryItems.map(item => (
          <IconButton
            key={item.icon}
            aria-label={item.label}
            title={item.label}
            size="md"
            icon={item.icon}
            disabled={item.disabled}
            onClick={() => onSecondaryAction?.(item.action, item)}
          />
        ))}
      </div>
    </aside>
  );
}

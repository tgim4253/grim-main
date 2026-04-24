import { IconButton } from '../../shared/ui';
import './mini-sidebar-rail.css';

export type PrimaryRailAction =
  | 'toggle-sidebar-panel'
  | 'open-search'
  | 'open-grid'
  | 'open-favorites';

export type PrimaryRailItem = {
  icon: 'folder-open' | 'search' | 'grid' | 'star';
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
  disabled?: boolean;
};

type MiniSidebarRailProps = {
  primaryItems: readonly PrimaryRailItem[];
  secondaryItems?: readonly SecondaryRailItem[];
  onPrimaryAction?: (action: PrimaryRailAction, item: PrimaryRailItem) => void;
};

const DEFAULT_SECONDARY_ITEMS: readonly SecondaryRailItem[] = [
  {
    icon: 'user',
    label: 'Account',
  },
  {
    icon: 'setting',
    label: 'Settings',
  },
];

export function MiniSidebarRail({
  primaryItems,
  secondaryItems = DEFAULT_SECONDARY_ITEMS,
  onPrimaryAction,
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
          />
        ))}
      </div>
    </aside>
  );
}

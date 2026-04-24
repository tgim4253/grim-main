import { IconButton } from '../../shared/ui';
import './mini-sidebar-rail.css';

type PrimaryRailItem = {
  icon: 'folder-open' | 'search' | 'grid' | 'star';
  label: string;
  active?: boolean;
  iconColor?: 'brand';
  iconHierarchy?: 'primary';
};

type SecondaryRailItem = {
  icon: 'user' | 'setting';
  label: string;
};

const PRIMARY_ITEMS: readonly PrimaryRailItem[] = [
  {
    icon: 'folder-open',
    label: 'Library',
    active: true,
  },
  {
    icon: 'search',
    label: 'Search',
  },
  {
    icon: 'grid',
    label: 'Grid',
  },
  {
    icon: 'star',
    label: 'Favorites',
  },
];

const SECONDARY_ITEMS: readonly SecondaryRailItem[] = [
  {
    icon: 'user',
    label: 'Account',
  },
  {
    icon: 'setting',
    label: 'Settings',
  },
];

export function MiniSidebarRail() {
  return (
    <aside className="mini-sidebar-rail" aria-label="Primary navigation">
      <nav className="mini-sidebar-rail__primary" aria-label="Library sections">
        {PRIMARY_ITEMS.map(item => (
          <IconButton
            key={item.icon}
            aria-label={item.label}
            title={item.label}
            kind="sidebar"
            size="2xl"
            icon={item.icon}
            active={item.active}
            iconColor={item.iconColor}
            iconHierarchy={item.iconHierarchy}
          />
        ))}
      </nav>

      <div className="mini-sidebar-rail__spacer" aria-hidden="true" />

      <div className="mini-sidebar-rail__secondary" aria-label="Window utilities">
        {SECONDARY_ITEMS.map(item => (
          <IconButton
            key={item.icon}
            aria-label={item.label}
            title={item.label}
            size="md"
            icon={item.icon}
          />
        ))}
      </div>
    </aside>
  );
}

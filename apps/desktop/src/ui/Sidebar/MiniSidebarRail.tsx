import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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

export function MiniSidebarRail({
  primaryItems,
  secondaryItems,
  onPrimaryAction,
  onSecondaryAction,
}: MiniSidebarRailProps) {
  const { t } = useTranslation('common');
  const resolvedSecondaryItems = useMemo<readonly SecondaryRailItem[]>(
    () =>
      secondaryItems ?? [
        {
          icon: 'user',
          label: t('common.account', { defaultValue: 'Account' }),
          action: 'open-account',
        },
        {
          icon: 'setting',
          label: t('settings.title', { defaultValue: 'Settings' }),
          action: 'open-settings',
        },
      ],
    [secondaryItems, t],
  );

  return (
    <aside
      className="mini-sidebar-rail"
      aria-label={t('navigation.primary', { defaultValue: 'Primary navigation' })}
    >
      <nav
        className="mini-sidebar-rail__primary"
        aria-label={t('navigation.library_sections', { defaultValue: 'Library sections' })}
      >
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

      <div
        className="mini-sidebar-rail__secondary"
        aria-label={t('navigation.window_utilities', { defaultValue: 'Window utilities' })}
      >
        {resolvedSecondaryItems.map(item => (
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

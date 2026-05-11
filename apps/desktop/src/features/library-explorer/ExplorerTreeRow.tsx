import { useTranslation } from 'react-i18next';
import { cx } from '../../shared/lib/cx';
import { Icon, IconButton } from '../../shared/ui';
import type { ExplorerNodeIcon } from './types';

type ExplorerTreeRowProps = {
  level: number;
  label: string;
  meta: string;
  icon: ExplorerNodeIcon;
  active: boolean;
  expanded: boolean;
  hasChildren: boolean;
  showActions?: boolean;
  actionsDisabled?: boolean;
  onClick: () => void;
  onFocus: () => void;
  onAddFolder?: () => void;
  onRefresh?: () => void;
};

export function ExplorerTreeRow({
  level,
  label,
  meta,
  icon,
  active,
  expanded,
  hasChildren,
  showActions = false,
  actionsDisabled = false,
  onClick,
  onFocus,
  onAddFolder,
  onRefresh,
}: ExplorerTreeRowProps) {
  const { t } = useTranslation('common');
  const chevronName = expanded ? 'chevron-down' : 'chevron-right';
  const chevronHierarchy = expanded ? 'primary' : 'tertiary';
  const iconColor = active ? 'brand' : expanded ? 'brand' : 'text';
  const iconHierarchy = active ? 'primary' : 'tertiary';

  return (
    <div
      className={cx(
        'explorer-tree-row',
        level > 1 && 'explorer-tree-row--nested',
        active && 'explorer-tree-row--active',
        showActions && 'explorer-tree-row--with-actions',
      )}
      data-active={active ? 'true' : undefined}
      data-expanded={expanded ? 'true' : undefined}
    >
      <button
        type="button"
        role="treeitem"
        aria-level={level}
        aria-selected={active}
        aria-expanded={hasChildren ? expanded : undefined}
        className="explorer-tree-row__main"
        onClick={onClick}
        onFocus={onFocus}
      >
        <span className="explorer-tree-row__leading" aria-hidden="true">
          {hasChildren ? (
            <Icon name={chevronName} size="xs" hierarchy={chevronHierarchy} color="text" />
          ) : (
            <span className="explorer-tree-row__arrow-slot" />
          )}
          <Icon name={icon} size="xs" hierarchy={iconHierarchy} color={iconColor} />
        </span>

        <span className="explorer-tree-row__label">{label}</span>
        {meta ? <span className="explorer-tree-row__meta">{meta}</span> : null}
      </button>

      {showActions ? (
        <span
          className="explorer-tree-row__actions"
          aria-label={t('explorer.folder_actions', { defaultValue: 'Folder actions' })}
        >
          <IconButton
            icon="folder-plus"
            size="sm"
            aria-label={t('explorer.add_folder', { defaultValue: 'Add folder' })}
            disabled={actionsDisabled || !onAddFolder}
            onClick={onAddFolder}
          />
          <IconButton
            icon="reload"
            size="sm"
            aria-label={t('explorer.refresh_folders', { defaultValue: 'Refresh folders' })}
            disabled={actionsDisabled || !onRefresh}
            onClick={onRefresh}
          />
        </span>
      ) : null}
    </div>
  );
}

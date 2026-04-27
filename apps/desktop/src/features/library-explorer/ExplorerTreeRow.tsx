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
  onClick: () => void;
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
  onClick,
}: ExplorerTreeRowProps) {
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
        <span className="explorer-tree-row__actions" aria-label="Folder actions">
          <IconButton icon="folder-plus" size="sm" aria-label="Add folder" />
          <IconButton icon="reload" size="sm" aria-label="Refresh folders" />
        </span>
      ) : null}
    </div>
  );
}

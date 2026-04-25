import { cx } from '../../shared/lib/cx';
import { Icon } from '../../shared/ui';
import type { ExplorerNodeIcon } from './explorerDummyData';

type ExplorerTreeRowProps = {
  level: number;
  label: string;
  meta: string;
  icon: ExplorerNodeIcon;
  active: boolean;
  expanded: boolean;
  hasChildren: boolean;
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
  onClick,
}: ExplorerTreeRowProps) {
  const chevronName = expanded ? 'chevron-down' : 'chevron-right';
  const chevronHierarchy = expanded ? 'primary' : 'tertiary';
  const iconColor = active ? 'brand' : expanded ? 'brand' : 'text';
  const iconHierarchy = active ? 'primary' : 'tertiary';

  return (
    <button
      type="button"
      role="treeitem"
      aria-level={level}
      aria-selected={active}
      aria-expanded={hasChildren ? expanded : undefined}
      className={cx(
        'explorer-tree-row',
        level > 1 && 'explorer-tree-row--nested',
        active && 'explorer-tree-row--active',
      )}
      data-active={active ? 'true' : undefined}
      data-expanded={expanded ? 'true' : undefined}
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
      <span className="explorer-tree-row__meta">{meta}</span>
    </button>
  );
}

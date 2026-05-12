import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../shared/lib/cx';
import './sidebar-panel.css';

type SidebarPanelProps = {
  rail?: ReactNode;
  title?: string;
  actions?: ReactNode;
  children?: ReactNode;
  collapsed?: boolean;
  className?: string;
  bodyClassName?: string;
};

export function SidebarPanel({
  rail,
  title,
  actions,
  children,
  collapsed = false,
  className,
  bodyClassName,
}: SidebarPanelProps) {
  const { t } = useTranslation('common');

  return (
    <aside
      className={cx('c-sidebar-panel', className)}
      data-collapsed={collapsed ? 'true' : undefined}
      aria-label={title ?? t('navigation.sidebar_panel', { defaultValue: 'Sidebar panel' })}
    >
      {rail ? <div className="c-sidebar-panel__rail">{rail}</div> : null}

      <div className={cx('c-sidebar-panel__body', bodyClassName)} hidden={collapsed}>
        {title || actions ? (
          <header className="c-sidebar-panel__header">
            {title ? <div className="c-sidebar-panel__title">{title}</div> : <div />}
            {actions ? <div className="c-sidebar-panel__actions">{actions}</div> : null}
          </header>
        ) : null}

        <div className="c-sidebar-panel__content">{children}</div>
      </div>
    </aside>
  );
}

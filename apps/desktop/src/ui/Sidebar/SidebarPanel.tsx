import type { ReactNode } from 'react';
import { cx } from '../../shared/lib/cx';
import './sidebar-panel.css';

type SidebarPanelProps = {
  rail?: ReactNode;
  title?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function SidebarPanel({
  rail,
  title,
  actions,
  children,
  className,
  bodyClassName,
}: SidebarPanelProps) {
  return (
    <aside className={cx('c-sidebar-panel', className)} aria-label={title ?? 'Sidebar panel'}>
      {rail ? <div className="c-sidebar-panel__rail">{rail}</div> : null}

      <div className={cx('c-sidebar-panel__body', bodyClassName)}>
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

import type { ReactNode } from 'react';

type SidebarProps = {
  children?: ReactNode;
};

export function Sidebar({ children }: SidebarProps) {
  return (
    <aside className="app-sidebar" aria-label="Library explorer">
      {children}
    </aside>
  );
}

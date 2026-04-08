import type { ReactNode } from 'react';
import { useTheme } from '../../shared/hooks';
import { Header } from '../Header/Header';
import { Sidebar } from '../Sidebar/Sidebar';

type AppLayoutProps = {
  header?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
};

export function AppLayout({ header, sidebar, children }: AppLayoutProps) {
  useTheme();

  return (
    <div className="app-shell">
      <Header>{header}</Header>
      <div className="app-horizontal">
        <Sidebar>{sidebar}</Sidebar>
        <main className="app-workspace">{children}</main>
      </div>
    </div>
  );
}

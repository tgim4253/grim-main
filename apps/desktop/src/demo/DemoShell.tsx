import type { ReactNode } from 'react';
import { useTheme } from '../shared/hooks';

type DemoShellProps = {
  children: ReactNode;
};

export function DemoShell({ children }: DemoShellProps) {
  useTheme();

  return <main className="app-workspace">{children}</main>;
}

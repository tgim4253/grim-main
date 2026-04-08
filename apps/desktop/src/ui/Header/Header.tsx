import type { ReactNode } from 'react';

type HeaderProps = {
  children?: ReactNode;
};

export function Header({ children }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__inner">{children}</div>
    </header>
  );
}

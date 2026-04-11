import { useEffect, useMemo } from 'react';

export type Theme = 'dark';

function applyTheme() {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.dataset.theme = 'dark';
  root.style.colorScheme = 'dark';
}

export function useTheme() {
  useEffect(() => {
    applyTheme();
  }, []);

  return useMemo(
    () => ({
      theme: 'dark' as const,
    }),
    [],
  );
}

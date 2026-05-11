import { useCallback, useEffect, useMemo, useState } from 'react';

export type ResolvedTheme = 'light' | 'dark';
export type Theme = ResolvedTheme | 'system';

type ThemeState = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
};

const DEFAULT_THEME = 'dark' satisfies ResolvedTheme;
const THEME_STORAGE_KEY = 'grim.theme';
const THEME_CHANGE_EVENT = 'grim:themechange';
const SYSTEM_THEME_QUERY = '(prefers-color-scheme: light)';

function normalizeTheme(theme: string | null | undefined): Theme {
  if (theme === 'light' || theme === 'dark' || theme === 'system') {
    return theme;
  }

  return DEFAULT_THEME;
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return DEFAULT_THEME;
  }

  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? 'light' : 'dark';
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? getSystemTheme() : theme;
}

function getThemeState(theme = getStoredTheme()): ThemeState {
  return {
    resolvedTheme: resolveTheme(theme),
    theme,
  };
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME;
  }

  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

function persistTheme(theme: Theme) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures so theme switching still works for this session.
  }
}

function applyTheme(theme = getStoredTheme()): ThemeState {
  const themeState = getThemeState(theme);

  if (typeof document === 'undefined') {
    return themeState;
  }

  const root = document.documentElement;
  root.dataset.theme = themeState.resolvedTheme;
  root.dataset.themePreference = theme;
  root.style.colorScheme = themeState.resolvedTheme;

  return themeState;
}

export function useTheme() {
  const [themeState, setThemeState] = useState(() => getThemeState());

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const updateThemeState = () => {
      setThemeState(applyTheme());
    };

    updateThemeState();

    const mediaQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(SYSTEM_THEME_QUERY)
        : null;

    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        updateThemeState();
      }
    };

    window.addEventListener(THEME_CHANGE_EVENT, updateThemeState);
    window.addEventListener('storage', handleStorage);
    mediaQuery?.addEventListener('change', updateThemeState);

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, updateThemeState);
      window.removeEventListener('storage', handleStorage);
      mediaQuery?.removeEventListener('change', updateThemeState);
    };
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    const normalizedTheme = normalizeTheme(nextTheme);
    persistTheme(normalizedTheme);
    setThemeState(applyTheme(normalizedTheme));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
    }
  }, []);

  return useMemo(
    () => ({
      resolvedTheme: themeState.resolvedTheme,
      setTheme,
      theme: themeState.theme,
    }),
    [setTheme, themeState.resolvedTheme, themeState.theme],
  );
}

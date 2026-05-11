import { useCallback, useEffect, useMemo, useState } from 'react';

export type ResolvedTheme = 'light' | 'dark';
export type Theme = ResolvedTheme | 'system';

type ThemeState = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
};

type ThemeChangeEventDetail = {
  theme: Theme;
};

const DEFAULT_THEME = 'dark' satisfies ResolvedTheme;
const THEME_STORAGE_KEY = 'grim.theme';
const THEME_CHANGE_EVENT = 'grim:themechange';
const SYSTEM_THEME_QUERY = '(prefers-color-scheme: light)';

let sessionTheme: Theme | null = null;

function normalizeTheme(theme: string | null | undefined): Theme {
  if (theme === 'light' || theme === 'dark' || theme === 'system') {
    return theme;
  }

  return DEFAULT_THEME;
}

function isTheme(theme: unknown): theme is Theme {
  return theme === 'light' || theme === 'dark' || theme === 'system';
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

function getActiveTheme(): Theme {
  return sessionTheme ?? getStoredTheme();
}

function getThemeState(theme = getActiveTheme()): ThemeState {
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

function applyTheme(theme = getActiveTheme()): ThemeState {
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

function getThemeFromChangeEvent(event: Event): Theme | null {
  if (!('detail' in event)) {
    return null;
  }

  const detail = event.detail as Partial<ThemeChangeEventDetail> | undefined;
  return isTheme(detail?.theme) ? detail.theme : null;
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

    const handleThemeChange = (event: Event) => {
      const nextTheme = getThemeFromChangeEvent(event);
      if (nextTheme) {
        sessionTheme = nextTheme;
      }

      updateThemeState();
    };

    updateThemeState();

    const mediaQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(SYSTEM_THEME_QUERY)
        : null;

    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        sessionTheme = normalizeTheme(event.newValue);
        updateThemeState();
      }
    };

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    window.addEventListener('storage', handleStorage);
    mediaQuery?.addEventListener('change', updateThemeState);

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      window.removeEventListener('storage', handleStorage);
      mediaQuery?.removeEventListener('change', updateThemeState);
    };
  }, []);

  const setTheme = useCallback((nextTheme: Theme) => {
    const normalizedTheme = normalizeTheme(nextTheme);
    sessionTheme = normalizedTheme;
    persistTheme(normalizedTheme);
    setThemeState(applyTheme(normalizedTheme));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<ThemeChangeEventDetail>(THEME_CHANGE_EVENT, {
          detail: { theme: normalizedTheme },
        }),
      );
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

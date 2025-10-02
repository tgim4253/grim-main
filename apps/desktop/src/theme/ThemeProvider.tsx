import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { setTheme as applyTheme } from '@tgim/ui/theme/theme';

type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  resetToSystem: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

const ensureAttributes = (mode: ThemeMode) => {
  if (typeof document === 'undefined') {
    return;
  }

  applyTheme(mode, document.documentElement);
  if (document.body) {
    applyTheme(mode, document.body);
  }
};

type ThemeState = {
  mode: ThemeMode;
  explicit: boolean;
};

const readInitialState = (): ThemeState => {
  if (typeof window === 'undefined') {
    return { mode: 'dark', explicit: false };
  }

  try {
    const stored = window.localStorage.getItem('grim-theme');
    if (stored === 'light' || stored === 'dark') {
      return { mode: stored, explicit: true };
    }
  } catch {
    // ignore storage access issues (tauri, private mode, etc.)
  }

  return { mode: prefersDark() ? 'dark' : 'light', explicit: false };
};

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const [{ mode, explicit }, setState] = useState<ThemeState>(() => readInitialState());
  const explicitRef = useRef(explicit);

  useEffect(() => {
    explicitRef.current = explicit;
  }, [explicit]);

  useEffect(() => {
    ensureAttributes(mode);

    try {
      if (explicit) {
        window.localStorage.setItem('grim-theme', mode);
      } else {
        window.localStorage.removeItem('grim-theme');
      }
    } catch {
      // ignore persistence failures
    }
  }, [mode, explicit]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) {
      return;
    }

    const handleChange = (event: MediaQueryListEvent) => {
      if (explicitRef.current) {
        return;
      }

      setState({ mode: event.matches ? 'dark' : 'light', explicit: false });
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
      return () => {
        media.removeEventListener('change', handleChange);
      };
    }

    if (typeof media.addListener === 'function') {
      media.addListener(handleChange);
      return () => {
        media.removeListener(handleChange);
      };
    }

    return;
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setState({ mode: next, explicit: true });
  }, []);

  const resetToSystem = useCallback(() => {
    setState({ mode: prefersDark() ? 'dark' : 'light', explicit: false });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: mode,
      setTheme,
      resetToSystem,
    }),
    [mode, setTheme, resetToSystem],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

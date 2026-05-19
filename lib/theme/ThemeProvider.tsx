'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  flattenTokensToCssVars,
  getTokens,
  tokensLight,
  type ThemeMode,
  type Tokens,
} from '@/lib/design-tokens';

const STORAGE_KEY = 'banyanos.theme';
const DEFAULT_MODE: ThemeMode = 'light';

type ThemeContextValue = {
  tokens: Tokens;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredMode(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredMode(mode: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage may be unavailable (e.g. private mode); fail silently
  }
}

function applyCssVars(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const vars = flattenTokensToCssVars(getTokens(mode));
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value);
  }
  root.setAttribute('data-theme', mode);
}

export function ThemeProvider({
  children,
  initialMode,
}: {
  children: ReactNode;
  initialMode?: ThemeMode;
}) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode ?? DEFAULT_MODE);

  useEffect(() => {
    const stored = readStoredMode();
    if (stored && stored !== mode) {
      setModeState(stored);
      applyCssVars(stored);
      return;
    }
    applyCssVars(mode);
    // run once on mount to pick up stored preference and emit vars
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    writeStoredMode(next);
    applyCssVars(next);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === 'light' ? 'dark' : 'light');
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ tokens: getTokens(mode), mode, setMode, toggle }),
    [mode, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }
  return ctx;
}

export { tokensLight as defaultTokens };

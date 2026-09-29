import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { themes, type Theme, type ThemeMode } from '@/constants/theme';

/** `null` means "follow the device". */
export type ThemePreference = ThemeMode | 'system';

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** Flips between light and dark, resolving `system` to a concrete value first. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Supplies the active theme.
 *
 * Default is `system`, so the app matches the device with no setup. The
 * override is deliberately in-memory only: persisting it needs AsyncStorage,
 * which is not currently a dependency. That is a known gap, not an oversight,
 * and it means a manual choice resets on cold launch.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>('system');

  const mode: ThemeMode = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const toggle = useCallback(() => {
    setPreference(mode === 'dark' ? 'light' : 'dark');
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themes[mode], preference, setPreference, toggle }),
    [mode, preference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export { ThemeContext };

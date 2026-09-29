import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { themes, type Theme, type ThemeMode } from '@/constants/theme';

/** `null` means "follow the device". */
export type ThemePreference = ThemeMode | 'system';

/**
 * Prefixed so it cannot collide with another library's keys in the same store.
 * AsyncStorage is a single flat namespace shared by every dependency in the app.
 */
const STORAGE_KEY = '@interntrack/theme-preference';

/**
 * Anything read back is untrusted — the store survives app updates, so a value
 * written by an older build is as possible as one written seconds ago. Narrowing
 * to the three known strings means a corrupt entry falls back to `system`
 * instead of producing `themes[undefined]`, which would crash every screen.
 */
const isThemePreference = (value: unknown): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system';

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  /** Flips between light and dark, resolving `system` to a concrete value first. */
  toggle: () => void;
  /**
   * Has the stored preference been read yet?
   *
   * Until this is true the provider is guessing at `system`, which is wrong for
   * anyone who chose the other mode. Screens render their backgrounds from
   * `theme`, so a dark-mode user would otherwise get a full-screen light flash on
   * every cold launch. The root layout holds the navigator until this flips.
   */
  hydrated: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Supplies the active theme.
 *
 * The preference is persisted, so a manual choice survives a cold launch.
 * `AsyncStorage` is `inExpoGo: true` on SDK 57, which is why persisting this
 * does not cost the app its Expo Go compatibility — the constraint that has
 * held since vault note `Decisions` -> D-011.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  // Read once on mount. Runs before the first paint the user can perceive,
  // because the root layout renders nothing until `hydrated` — see below.
  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        // The guard is what makes this safe under a fast unmount: a rejected
        // read or a remount mid-flight would otherwise set state on a component
        // that is gone, which React warns about rather than silently ignoring.
        if (!active) return;
        if (isThemePreference(stored)) setPreferenceState(stored);
      })
      .catch(() => undefined)
      .finally(() => {
        // Flip even on failure. `system` is a perfectly good outcome, and
        // leaving this false forever would hang the app on the splash.
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  /**
   * Writes are fire-and-forget.
   *
   * A failed write means the preference is not remembered next launch — a
   * degraded experience, not a broken one, and the next successful set
   * overwrites it anyway. Surfacing it would mean an error path on a toggle
   * that has no useful failure mode, so it is logged for development and
   * dropped, matching how the rest of the app treats non-fatal storage writes.
   */
  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch((error: unknown) => {
      console.error('[theme] could not persist preference', error);
    });
  }, []);

  const mode: ThemeMode = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const toggle = useCallback(() => {
    setPreference(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themes[mode], preference, setPreference, toggle, hydrated }),
    [mode, preference, setPreference, toggle, hydrated],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export { ThemeContext };

import { useContext } from 'react';
import { ThemeContext, type ThemePreference } from '@/context/ThemeContext';
import { getElevation, type Theme } from '@/constants/theme';

export interface UseThemeResult {
  theme: Theme;
  mode: Theme['mode'];
  colors: Theme['c'];
  elevation: ReturnType<typeof getElevation>;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  toggle: () => void;
}

/**
 * Throws rather than returning a default if used outside `ThemeProvider`.
 *
 * A silent fallback would render the light palette on a dark device and look
 * like a theming bug somewhere else entirely, so the mistake is surfaced at the
 * point of the mistake instead.
 */
export function useTheme(): UseThemeResult {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside <ThemeProvider>');
  }

  const { mode } = ctx.theme;

  return {
    theme: ctx.theme,
    mode,
    colors: ctx.theme.c,
    elevation: getElevation(mode),
    preference: ctx.preference,
    setPreference: ctx.setPreference,
    toggle: ctx.toggle,
  };
}

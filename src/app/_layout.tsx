// Side effect only. Must be first: it filters a dev warning that Expo Router
// raises from its own initial-URL promise, and the root layout is evaluated
// before that promise settles.
import '@/dev/ignoreUpstreamWarnings';

import { useMemo } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/context/AppContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useTheme } from '@/hooks/useTheme';
import { fontSize, fontWeight } from '@/constants/theme';

/**
 * No native splash control, deliberately.
 *
 * This used to call `setOptions({ duration: 600 })` and `preventAutoHideAsync()`,
 * holding the native splash until `index.tsx` released it. Two reasons that was
 * wrong:
 *
 *  1. It showed the launch screen **twice** on every cold start — the native
 *     splash, then the branded screen in `index.tsx`. The branded one is the
 *     design; the native one was a 600 ms delay in front of it.
 *  2. Since SDK 52, Expo Go shows the app icon instead of the splash screen, so
 *     the config in `app.json` does not reach it at all. The hold was buying
 *     nothing in the environment this app actually runs in.
 *     → [[Decisions#D-011 — Verify every Expo API against the installed SDK]]
 *
 * What covers the gap instead is `index.tsx`'s own branded screen, which is pure
 * JS and so renders identically in Expo Go and in a standalone build. The splash
 * configuration was removed from `app.json` for the same reason; if the app ever
 * ships as a real binary, put it back there rather than holding it from JS.
 */

/**
 * Root layout. Providers only - no auth logic here.
 *
 * The redirect lives in `index.tsx` instead, because a `<Redirect>` during the
 * provider's own render would run before the database has finished opening and
 * bounce the user to the login screen on every cold launch.
 *
 * The navigator sits inside `ThemedStack` so its header colours can read the
 * active theme; `Stack` must not be rendered before the provider resolves.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppProvider>
          <ThemedStack />
        </AppProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedStack() {
  const { colors: c, mode, hydrated } = useTheme();
  const screenOptions = useMemo(
    () => ({
      headerStyle: { backgroundColor: c.bg },
      headerTintColor: c.primary,
      headerTitleStyle: { color: c.text, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
      headerShadowVisible: false,
      contentStyle: { backgroundColor: c.bg },
    }),
    [c],
  );

  /*
   * Nothing renders until the stored preference is read.
   *
   * This used to `return null`, and that was safe only because the native splash
   * was held over it. With the hold gone, `null` would be a blank frame on every
   * cold start — so it paints the brand background instead, which is the same
   * colour `index.tsx` uses for the screen that replaces it. The window is a
   * local AsyncStorage read, and `brandDark` is dark in both modes, so neither a
   * white flash nor the light-then-dark flash a dark-mode user would otherwise
   * get.
   */
  if (!hydrated) return <View style={{ flex: 1, backgroundColor: c.brandDark }} />;

  return (
    <>
      {/* Inverted: dark mode needs light glyphs on a dark header. */}
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="internship-setup" options={{ headerShown: false }} />
        <Stack.Screen name="change-password" options={{ headerShown: false }} />
        <Stack.Screen
          name="add-record"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen name="print-records" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

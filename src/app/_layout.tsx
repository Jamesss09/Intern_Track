import { useMemo } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/context/AppContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { useTheme } from '@/hooks/useTheme';
import { fontSize, fontWeight } from '@/constants/theme';

/**
 * Global scope, deliberately not inside a component.
 *
 * The SDK 57 guidance is explicit that `preventAutoHideAsync` belongs at module
 * scope: called from a component, it can land after the native splash has
 * already auto-hidden, which leaves the splash showing for an unpredictable
 * moment. `hideAsync` is then driven from `index.tsx` once the database has
 * finished opening.
 *
 * `duration` is a little over the 400 ms default so the branded hand-off into
 * `index.tsx` is not a hard cut. `fade` is deliberately omitted — it is iOS
 * only, and v1 targets Android. → [[Decisions#D-011 — Verify every Expo API against the installed SDK]]
 */
SplashScreen.setOptions({ duration: 600 });
SplashScreen.preventAutoHideAsync();

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
  const { colors: c, mode } = useTheme();
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

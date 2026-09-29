import { useMemo } from 'react';
import { Redirect, Stack } from 'expo-router';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { fontSize, fontWeight } from '@/constants/theme';

/**
 * Logged-out routes.
 *
 * The `Redirect` guards the group rather than guarding each screen, so a deep
 * link like `/register` cannot be reached by a signed-in user. See vault note
 * `Architecture` -> "Decision 6".
 */
export default function AuthLayout() {
  const { status } = useApp();
  const { colors: c } = useTheme();

  const screenOptions = useMemo(
    () => ({
      headerStyle: { backgroundColor: c.bg },
      headerTitleStyle: { color: c.text, fontWeight: fontWeight.bold, fontSize: fontSize.lg },
      headerTintColor: c.primary,
      headerShadowVisible: false,
      contentStyle: { backgroundColor: c.bg },
    }),
    [c],
  );

  if (status === 'authenticated') return <Redirect href="/(tabs)" />;

  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      {/* Register draws its own `ScreenHeader` band, so the stack header would
          be a second title stacked directly above the first. */}
      <Stack.Screen name="register" options={{ headerShown: false }} />
    </Stack>
  );
}

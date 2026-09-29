import { useEffect, useMemo } from 'react';
import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { fontSize, fontWeight, scaledLine, spacing } from '@/constants/theme';
import splashIcon from '../../assets/splash-icon.png';

/**
 * The auth gate, and the app's splash screen.
 *
 * Nothing else renders until `status` resolves, which is exactly the window the
 * mockup's splash occupies — app launch to app ready. So the branded splash is
 * this screen's `loading` state rather than a separate route: no extra
 * navigation hop, and no flash between a splash route and the real gate.
 *
 * The native splash is held by `preventAutoHideAsync()` in `_layout.tsx` and
 * released here. If opening the database failed, `error` is set and the gate
 * shows the message instead of silently redirecting to a login screen that
 * cannot work.
 */
export default function Index() {
  const { status, error, user } = useApp();
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  // Released on every terminal status, including `error` — a splash held over a
  // failure screen is the one way this can look genuinely broken.
  useEffect(() => {
    if (status !== 'loading') SplashScreen.hide();
  }, [status]);

  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        {/* Overrides the root layout's status bar, which picks its colour for
            `bg` and would put dark glyphs on this band. */}
        <StatusBar style="light" />

        <View style={styles.brand}>
          <Image source={splashIcon} style={styles.mark} resizeMode="contain" />

          <Text style={styles.wordmark} accessibilityRole="header">
            <Text style={styles.wordFirst}>Intern</Text>
            <Text style={styles.wordSecond}>Track</Text>
          </Text>

          <Text style={styles.tagline}>Track Your OJT. Build Your Future.</Text>
        </View>

        <View style={styles.footer}>
          <ActivityIndicator size="small" color={c.onBrand} />
          <Text style={styles.promise}>
            Manage your OJT hours, track your progress, and keep your records — all in one place.
          </Text>
        </View>
      </View>
    );
  }

  if (error && !user) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Could not open the database</Text>
        <Text style={styles.caption}>{error}</Text>
      </View>
    );
  }

  return <Redirect href={status === 'authenticated' ? '/(tabs)' : '/(auth)/login'} />;
}

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    /**
     * The mockup's splash is full-bleed dark, so this is `brandDark` and not a
     * card on `bg`. Safe in both modes: light mode shows the deep step, dark
     * mode the lifted one, and `onBrand` is legible on each.
     */
    splash: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.brandDark,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xxxl,
      paddingBottom: spacing.xxl,
    },
    brand: { alignItems: 'center', gap: spacing.md },
    mark: { width: 96, height: 96 },
    wordmark: {
      fontSize: fontSize.xxl * 1.2,
      fontWeight: fontWeight.bold,
      letterSpacing: -0.5,
    },
    wordFirst: { color: c.onBrand },
    /** The two-tone split from the mockup, on a token rather than a literal. */
    wordSecond: { color: c.primaryOnBrand },
    tagline: {
      fontSize: fontSize.md,
      color: c.onBrand,
      opacity: 0.75,
      textAlign: 'center',
    },

    footer: { alignItems: 'center', gap: spacing.lg },
    promise: {
      fontSize: fontSize.sm,
      lineHeight: scaledLine(fontSize.sm, 1.5),
      color: c.onBrand,
      opacity: 0.75,
      textAlign: 'center',
      maxWidth: 320,
    },

    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl,
      backgroundColor: c.bg,
    },
    errorTitle: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.danger,
      textAlign: 'center',
    },
    caption: {
      fontSize: fontSize.md,
      color: c.textMuted,
      textAlign: 'center',
    },
  });

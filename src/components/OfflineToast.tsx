import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { fontSize, fontWeight, radius, spacing } from '@/constants/theme';

interface OfflineToastProps {
  visible: boolean;
  onDismiss: () => void;
  /** Default 4 s. The mockup shows it as a transient confirmation. */
  durationMs?: number;
}

/**
 * "Working Offline — your data is saved locally."
 *
 * Honest about something the app already is: there is no network layer at all,
 * so this is a reassurance, not a status report. → [[Architecture#Decision 1: Offline-first, no backend]]
 *
 * The timer resets whenever `visible` goes true, so a re-shown toast gets a
 * full duration rather than inheriting a nearly-expired one. It is not shown on
 * a connectivity change, because there is nothing listening for one.
 */
export const OfflineToast = ({ visible, onDismiss, durationMs = 4000 }: OfflineToastProps) => {
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(c), [c]);

  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(onDismiss, durationMs);
    // Cleared on unmount too, so a dismissed-by-navigation toast does not fire
    // `onDismiss` against an unmounted screen.
    return () => clearTimeout(timer);
  }, [visible, durationMs, onDismiss]);

  if (!visible) return null;

  return (
    <View
      style={[styles.toast, { top: insets.top + spacing.md }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel="Working offline. Your data is saved locally."
    >
      <View style={styles.badge}>
        <Ionicons name="cloud-offline" size={16} color={c.onBrand} />
      </View>

      <View style={styles.text}>
        <Text style={styles.title}>Working Offline</Text>
        <Text style={styles.message}>Your data is saved locally</Text>
      </View>
    </View>
  );
};

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    toast: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.brandDark,
      // The toast is the same `brandDark` as the Dashboard hero it lands on, so
      // without an edge it would be a slightly-floating rectangle of the exact
      // same colour. A hairline in `onBrand` defines it on a navy hero and on a
      // plain `bg` page alike, and costs nothing in light mode.
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.onBrand,
      borderRadius: radius.lg,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      // Below the status bar, above the header. `elevation` would be invisible
      // in dark mode — see the note in `theme.ts` — so the border carries the
      // separation instead of a shadow.
      //
      // `marginHorizontal` is what makes `maxWidth` safe: the toast is
      // `alignSelf: 'center'`, so on a 320 dp screen a bare `maxWidth: 320`
      // would resolve to exactly the full screen width and sit flush against
      // both edges. With the margin the width resolves to 320 - 32 = 288, and
      // on anything wider the cap takes over.
      maxWidth: 320,
      marginHorizontal: spacing.lg,
      zIndex: 10,
    },
    badge: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.success,
    },
    text: { flexShrink: 1, gap: 1 },
    title: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: c.onBrand,
    },
    message: {
      fontSize: fontSize.xs,
      color: c.onBrand,
      opacity: 0.75,
    },
  });

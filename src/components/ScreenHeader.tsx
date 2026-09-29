import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import {
  contentWidth,
  fontSize,
  fontWeight,
  radius,
  spacing,
  HIT_SIZE,
} from '@/constants/theme';

interface ScreenHeaderProps {
  title: string;
  /** Second line under the title — a placement, a student's course. */
  subtitle?: string;
  /**
   * Renders a back affordance. Omitted entirely when absent, so a root screen
   * does not grow an inert arrow just because the component was reused.
   */
  onBack?: () => void;
  /** Right-hand action: a filter funnel, a gear, anything tappable. */
  action?: ReactNode;
  /**
   * `band` is full-bleed and sits above the scroll view. `inset` is a rounded
   * card that scrolls with the content, for a header that is part of a list
   * rather than a fixed band.
   */
  variant?: 'band' | 'inset';
}

/**
 * The dark header band from the mockup, used on every screen except the tabs
 * and Splash.
 *
 * `brandDark` is the one token that inverts between modes, so this component
 * never reaches for `surface` or `bg` — it always names the band explicitly and
 * pairs it with `onBrand`. A header painted in `text` on a dark fill is the
 * mistake this exists to make impossible.
 */
export const ScreenHeader = ({
  title,
  subtitle,
  onBack,
  action,
  variant = 'band',
}: ScreenHeaderProps) => {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c, variant), [c, variant]);

  return (
    <View style={styles.container}>
      {/*
        The band stays full-bleed edge to edge, but its *contents* are capped to
        the same `maxContentWidth` column the screen body uses. Without this the
        title sits 16 px from the screen edge on a 1024 dp tablet while the
        content below it is centred — the title would look misaligned rather
        than banded.
      */}
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={24} color={c.onBrand} />
          </Pressable>
        ) : null}

        <View style={styles.titles}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </View>
  );
};

/**
 * Square icon button sized to `HIT_SIZE`.
 *
 * A 24 px glyph alone is below the 44 px Android minimum, and a header action
 * has no padding to borrow from the way a form field does.
 */
export const HeaderAction = ({
  icon,
  onPress,
  label,
  active = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  label: string;
  /**
   * Marks a control whose state is in effect — an applied filter, not merely an
   * available one.
   *
   * A dot rather than a recoloured glyph, because both states are drawn in
   * `onBrand` on the band and recolouring would not survive either. The dot is
   * hidden from screen readers: the action's own label carries the state.
   */
  active?: boolean;
}) => {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={active ? `${label}, filter applied` : label}
      accessibilityHint={active ? 'Opens the filter options' : 'Opens filter options'}
    >
      <Ionicons name={icon} size={22} color={c.onBrand} />

      {active ? <View style={styles.activeDot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" /> : null}
    </Pressable>
  );
};

/**
 * Worded header action, for the cases where a glyph would be guesswork —
 * "Edit" and "Done" on a details screen, neither of which has an obvious icon.
 *
 * The label is the control here, so it gets the larger type size; the glyph is
 * a reinforcement that can be dropped without losing meaning.
 */
export const HeaderButton = ({
  label,
  onPress,
  icon,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) => {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
    >
      {icon ? <Ionicons name={icon} size={17} color={c.onBrand} /> : null}
      <Text style={styles.textActionLabel}>{label}</Text>
    </Pressable>
  );
};

const createStyles = (c: ReturnType<typeof useTheme>['colors'], variant: 'band' | 'inset' = 'band') =>
  StyleSheet.create({
    container: {
      backgroundColor: c.brandDark,
      minHeight: 56,
      paddingVertical: spacing.sm,
      ...(variant === 'inset'
        ? {
            marginHorizontal: spacing.lg,
            marginTop: spacing.lg,
            borderRadius: radius.lg,
          }
        : {}),
    },
    row: {
      ...contentWidth,
      // Fills the band's height so the 48 px targets stay vertically centred
      // inside `minHeight` rather than sitting on top of it.
      flexGrow: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    titles: { flex: 1, gap: 1 },
    title: {
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: c.onBrand,
    },
    subtitle: {
      fontSize: fontSize.xs,
      color: c.onBrand,
      // `onBrand` is already 10.9:1+ against the band; opacity carries it to a
      // clearly secondary line without dropping under 4.5:1.
      opacity: 0.75,
    },
    back: {
      width: HIT_SIZE,
      height: HIT_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -spacing.sm,
      borderRadius: radius.sm,
    },
    action: { marginRight: -spacing.sm },
    textAction: {
      minHeight: HIT_SIZE,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radius.sm,
    },
    textActionLabel: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.onBrand,
    },
    actionButton: {
      width: HIT_SIZE,
      height: HIT_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
    },
    /** Sits on the glyph's shoulder, so it never enlarges the 48 px target. */
    activeDot: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.primaryOnBrand,
    },
    pressed: { opacity: 0.6 },
  });

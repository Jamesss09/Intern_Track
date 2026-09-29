import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { fontSize, fontWeight, radius, scaledLine, spacing, NUMERIC } from '@/constants/theme';

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'primary' | 'success';
  /**
   * `hero` promotes one stat to the headline of the screen. Only one per screen:
   * two large numbers side by side means neither reads as the main figure.
   */
  emphasis?: 'normal' | 'hero';
}

/** One number with its label. Used on the Dashboard and Progress screens. */
export const StatCard = ({
  label,
  value,
  hint,
  tone = 'default',
  emphasis = 'normal',
}: StatCardProps) => {
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const hero = emphasis === 'hero';
  const valueColor =
    tone === 'primary' ? c.primary : tone === 'success' ? c.success : c.text;

  return (
    <View
      style={[styles.card, elevation.sm, hero && styles.cardHero]}
      // Without this a screen reader announces the number with no idea what it
      // is, because the label above it is a separate node.
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}${hint ? `. ${hint}` : ''}`}
    >
      <Text style={styles.label}>{label}</Text>
      {/*
        `adjustsFontSizeToFit` needs `minimumFontScale` to do anything on
        Android — without it that platform treats it as a no-op. Between them
        the number shrinks to fit the card instead of overflowing it, which is
        the realistic case here: at 2x system font a six-character figure like
        "291.50" is wider than a 138 dp card on the narrowest phone.
      */}
      <Text
        style={[styles.value, hero && styles.valueHero, { color: valueColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {value}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
};

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    card: {
      flex: 1,
      /*
       * 120, not the 140 this started at. The grid is `flexWrap`, so this is
       * what decides whether two cards share a row or the row collapses to one.
       * At the narrowest supported width (320 dp) the content box is
       * 320 - 2*16 = 288, and 2*120 + 12 (gap) = 252 fits. The old 140 made
       * 2*140 + 12 = 292 exceed it, so every small phone got a 1-up stack.
       */
      minWidth: 120,
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    cardHero: {
      borderRadius: radius.xl,
      paddingVertical: spacing.xl,
    },
    label: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    value: {
      ...NUMERIC,
      fontSize: fontSize.xxl,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    valueHero: {
      fontSize: fontSize.display,
      // `scaledLine`, not a literal: `lineHeight` does not scale with the
      // system font setting while `fontSize` does, so a literal here clips the
      // digits at any font scale above ~110%.
      lineHeight: scaledLine(fontSize.display, 1.1),
    },
    /**
     * `textMuted`, not `textSubtle`: the hint is 11 px text and `textSubtle`
     * measures 3.53:1 on `surface` in light mode and 4.22:1 in dark, under the
     * 4.5:1 floor for normal text in both.
     */
    hint: {
      fontSize: fontSize.xs,
      color: c.textMuted,
    },
  });

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { fontSize, fontWeight, spacing, NUMERIC } from '@/constants/theme';

interface ProgressBarProps {
  /** 0-100. Clamped here so a bad value cannot render a fill wider than its track. */
  progress: number;
  height?: number;
  showLabel?: boolean;
  label?: string;
}

/**
 * Static, not animated. A bar that counts up from zero every time the Progress
 * tab mounts is motion the user did not ask for and cannot skip.
 *
 * The groove uses its own `track` token rather than a surface colour: a track
 * painted in the same colour as the card behind it is invisible, which reads as
 * a rendering bug rather than as a progress bar.
 */
export const ProgressBar = ({ progress, height = 10, showLabel = true, label }: ProgressBarProps) => {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const clamped = Math.max(0, Math.min(100, progress));
  const complete = clamped >= 100;
  const percentLabel = `${clamped.toFixed(0)}%`;

  return (
    <View>
      {showLabel ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label ?? 'Progress'}</Text>
          <Text style={[styles.value, complete && styles.valueComplete]}>{percentLabel}</Text>
        </View>
      ) : null}

      <View
        style={[styles.track, { height, borderRadius: height / 2 }]}
        accessibilityRole="progressbar"
        accessibilityLabel={label ?? 'Progress'}
        accessibilityValue={{ min: 0, max: 100, now: clamped, text: percentLabel }}
      >
        <View
          style={[
            styles.fill,
            {
              width: `${clamped}%`,
              borderRadius: height / 2,
              backgroundColor: complete ? c.success : c.primary,
            },
          ]}
        />
      </View>
    </View>
  );
};

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: spacing.sm,
      gap: spacing.md,
    },
    label: {
      flex: 1,
      fontSize: fontSize.sm,
      color: c.textMuted,
    },
    value: {
      ...NUMERIC,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    valueComplete: { color: c.success },
    track: {
      width: '100%',
      backgroundColor: c.track,
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
    },
  });

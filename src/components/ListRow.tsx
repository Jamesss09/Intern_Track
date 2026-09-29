import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { fontSize, fontWeight, spacing, HIT_SIZE } from '@/constants/theme';

interface ListRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  /** Omit for a navigation row — it renders no value and shows a chevron. */
  value?: string;
  /** Navigation rows get a chevron. Omit for a read-only value. */
  onPress?: () => void;
  /** `danger` is for Logout, and nothing else. */
  tone?: 'default' | 'danger';
}

/**
 * Icon + label + value, with an optional chevron. The row treatment on OJT
 * Setup and Profile in the mockup.
 *
 * Read-only and tappable rows are deliberately distinguishable without relying
 * on colour alone: only tappable rows get a chevron, and only tappable rows
 * declare an `onPress` to a screen reader.
 */
export const ListRow = ({ icon, label, value, onPress, tone = 'default' }: ListRowProps) => {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const danger = tone === 'danger';
  const labelColor = danger ? c.danger : c.text;
  const valueColor = danger ? c.danger : c.textMuted;

  const body = (
    <>
      <Ionicons name={icon} size={20} color={danger ? c.danger : c.primary} />

      <View style={styles.body}>
        <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>
        {value ? (
          <Text style={[styles.value, { color: valueColor }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
      </View>

      {onPress ? <Ionicons name="chevron-forward" size={18} color={c.textSubtle} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} accessibilityLabel={value ? `${label}: ${value}` : label}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {body}
    </Pressable>
  );
};

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      // `HIT_SIZE` is the floor, not the target — rows grow with their content.
      minHeight: HIT_SIZE + 8,
      paddingVertical: spacing.sm,
    },
    pressed: { opacity: 0.6 },
    body: { flex: 1, gap: 2 },
    label: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.medium,
    },
    value: {
      fontSize: fontSize.sm,
    },
  });

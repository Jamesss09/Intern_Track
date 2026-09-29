import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { fontSize, fontWeight, radius, scaledLine, spacing } from '@/constants/theme';

interface ActionTileProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  /** Defaults to `primary`. `success` marks the export/print action. */
  tone?: 'primary' | 'success';
}

/**
 * One cell of the Dashboard's 2x2 grid — "Track Hours", "View Records",
 * "Progress", "Print Records".
 *
 * The white glyph sits on a filled circle rather than a tinted square, which is
 * what separates it from the `ListRow` treatment on the Profile screen. Two
 * different-looking tap targets for two different kinds of navigation.
 */
export const ActionTile = ({ icon, title, subtitle, onPress, tone = 'primary' }: ActionTileProps) => {
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const fill = tone === 'success' ? c.success : c.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tile, elevation.sm, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <View style={[styles.badge, { backgroundColor: fill }]}>
        <Ionicons name={icon} size={20} color={c.surface} />
      </View>

      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
};

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    tile: {
      flex: 1,
      minHeight: 96,
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.sm,
    },
    pressed: { backgroundColor: c.surfaceAlt },
    badge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: { flex: 1, gap: 2 },
    title: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },
    subtitle: {
      fontSize: fontSize.xs,
      color: c.textMuted,
      lineHeight: scaledLine(fontSize.xs, 1.35),
    },
  });

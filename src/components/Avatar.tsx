import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { fontWeight, radius } from '@/constants/theme';

interface AvatarProps {
  name: string;
  size?: number;
  /**
   * The camera badge from the mockup's Profile screen.
   *
   * Decorative only — there is no image picker in v1, so a badge that looks
   * tappable but does nothing is worse than no badge. When picking is added,
   * this needs an `onPress` and a real accessibility role alongside it.
   */
  showBadge?: boolean;
  /** Renders a light glyph for a dark band. `default` is for light surfaces. */
  onDark?: boolean;
}

/**
 * Initials in a circle, used in the Dashboard and Profile headers.
 *
 * No image, no upload, no stored avatar — a student's face is not something an
 * hours-tracker needs to collect, and the mockup's placeholder circle is
 * honest about that. Initials scale to any `size` without an asset.
 */
export const Avatar = ({ name, size = 48, showBadge = false, onDark = false }: AvatarProps) => {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  // First letter of the first two words: "James Carl Enquig" -> "JC".
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const badge = Math.round(size * 0.34);
  // An empty circle is a hole in the layout, so a nameless avatar falls back to
  // the glyph — which is also what the Register screen shows before the first
  // character is typed.
  const showGlyph = initials.length === 0;

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        {showGlyph ? (
          <Ionicons
            name="person"
            size={size * 0.46}
            color={onDark ? c.onBrand : c.textMuted}
          />
        ) : (
          <Text
            style={[
              styles.initials,
              { fontSize: size * 0.38, lineHeight: size * 0.46 },
              onDark ? styles.initialsOnDark : styles.initialsOnLight,
            ]}
          >
            {initials}
          </Text>
        )}
      </View>

      {showBadge ? (
        <View
          style={[
            styles.badge,
            {
              width: badge,
              height: badge,
              borderRadius: badge / 2,
              borderWidth: Math.max(2, Math.round(size * 0.045)),
            },
          ]}
        >
          <Ionicons name="camera" size={badge * 0.55} color={c.surface} />
        </View>
      ) : null}
    </View>
  );
};

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    wrapper: { position: 'relative' },
    /**
     * One fill for both surfaces. `onDark` only changes the glyph/initial
     * colour — the circle itself reads as raised against `bg` and against a
     * `brandDark` band alike, so a second branch here would be two names for
     * one colour.
     */
    circle: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surfaceAlt,
    },
    initials: { fontWeight: fontWeight.semibold },
    initialsOnDark: { color: c.onBrand },
    initialsOnLight: { color: c.textMuted },
    badge: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
      borderColor: c.brandDark,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
  });

import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { fontWeight, radius } from '@/constants/theme';

interface AvatarProps {
  name: string;
  size?: number;
  /**
   * The student's own picture, as a `file://` URI. `null` draws initials.
   *
   * Resolved from `users.avatar_path` by `avatarService.resolveAvatarUri`, which
   * already returns `null` for a file that has gone missing — so this prop being
   * `null` means "draw initials", never "draw a broken image".
   * → [[Avatar]]
   */
  uri?: string | null;
  /**
   * Makes the whole avatar a button.
   *
   * Omit it and the avatar is decorative. Supply it and the camera badge appears,
   * because a badge that looks tappable but does nothing is worse than no badge:
   * the mockup's circle carries one, and it only earns its place once there is
   * something behind it.
   */
  onPress?: () => void;
  /** The button's label. Required alongside `onPress` — a button with no name is
   *  announced as just "button". */
  accessibilityLabel?: string;
  /** Renders a light glyph for a dark band. `default` is for light surfaces. */
  onDark?: boolean;
}

/**
 * The student's picture, or their initials in a circle.
 *
 * The picture is optional by design, not by omission: an hours-tracker has no
 * business collecting a face, so initials remain the default everywhere and the
 * image is something the student opted into on their own Profile screen. Nothing
 * in the app is blocked behind it and no document requires it.
 *
 * → [[Avatar]]
 */
export const Avatar = ({
  name,
  size = 48,
  uri = null,
  onPress,
  accessibilityLabel,
  onDark = false,
}: AvatarProps) => {
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

  const circleStyle = [
    styles.circle,
    { width: size, height: size, borderRadius: size / 2 },
  ];

  const face = uri ? (
    /**
     * `cover`, not `contain`: the stored file is already a centred square, and
     * `contain` would letterbox it against the circle's background if a future
     * change ever let a non-square through.
     */
    <Image
      source={{ uri }}
      style={[circleStyle, styles.image]}
      resizeMode="cover"
      // A picture is decoration here, and the name is always rendered as text
      // beside it, so a screen reader gets the name once rather than twice.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  ) : showGlyph ? (
    <Ionicons name="person" size={size * 0.46} color={onDark ? c.onBrand : c.textMuted} />
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
  );

  const circle = (
    <View style={styles.wrapper}>
      <View style={circleStyle}>{face}</View>

      {onPress ? (
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

  if (!onPress) return circle;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? 'Profile picture'}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      {circle}
    </Pressable>
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
      // The circle itself, so the initials and the glyph get the same shape the
      // filled `View` used to provide.
      overflow: 'hidden',
    },
    /**
     * `overflow: hidden` is on `.circle` rather than here, and it has to be on
     * the element that carries the radius. React Native clips children to a
     * parent's border radius, but setting a radius on a child does not clip that
     * child's *own* pixels — an `<Image>` with a borderRadius and no clipping
     * ancestor renders as a rounded-corner square, with the photograph's corners
     * still visible outside the circle.
     */
    image: { width: '100%', height: '100%' },
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
    /**
     * A dim, not a scale or an opacity fade. Scaling an avatar on press makes a
     * photograph visibly jump, and on a 64 px circle the movement is large
     * relative to the thing being pressed.
     */
    pressed: { opacity: 0.7 },
  });

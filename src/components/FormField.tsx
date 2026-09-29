import { forwardRef, useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { fontSize, fontWeight, radius, spacing, HIT_SIZE } from '@/constants/theme';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  /**
   * Leading glyph inside the input — a person in the email field, a lock in the
   * password field. Decorative: `accessibilityLabel` is already the field label,
   * so a second announced name would be noise.
   */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

/**
 * Labelled text input wired for `react-hook-form`'s `Controller` render prop.
 *
 * Forwarding the ref matters: without it, `setFocus` from `form.setFocus()` on
 * a failed submit does nothing, and the user gets an error message for a field
 * they cannot see.
 */
export const FormField = forwardRef<TextInput, FormFieldProps>(function FormField(
  { label, error, hint, icon, style, ...inputProps },
  ref,
) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>

      <View style={[styles.inputRow, !!error && styles.inputError]}>
        {/* `textSubtle` is kept for the glyph: at 3.53:1 on `surface` it clears
            the 3:1 floor for a meaningful graphic, and a quieter icon lets the
            typed value lead. */}
        {icon ? <Ionicons name={icon} size={18} color={c.textSubtle} style={styles.icon} /> : null}

        <TextInput
          ref={ref}
          style={[styles.input, style]}
          // `textMuted`, not `textSubtle`. A placeholder is text, not a graphic,
          // and 3.53:1 is under the 4.5:1 floor. The field already carries a
          // visible `label`, so this is not the only cue of what goes here.
          placeholderTextColor={c.textMuted}
          accessibilityLabel={label}
          accessibilityHint={hint}
          {...inputProps}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

interface ControlledFieldProps<T extends FieldValues>
  extends Omit<FormFieldProps, 'value' | 'onChangeText' | 'error' | 'label'> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  /** Called on every keystroke - used to clear a stale server error. */
  onEdit?: () => void;
}

/**
 * `FormField` bound to a `react-hook-form` field.
 *
 * Wrapping the `Controller` here means screens declare fields declaratively
 * instead of repeating the same eight-line `render` prop for every input.
 */
export function ControlledField<T extends FieldValues>({
  control,
  name,
  label,
  onEdit,
  ...inputProps
}: ControlledFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState }) => (
        <FormField
          label={label}
          value={typeof value === 'string' ? value : ''}
          onBlur={onBlur}
          onChangeText={(text) => {
            onChange(text);
            onEdit?.();
          }}
          error={fieldState.error?.message}
          {...inputProps}
        />
      )}
    />
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Required when `variant` is `primary` or `danger`. */
  accessibilityHint?: string;
}

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityHint,
}: ButtonProps) => {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const isDisabled = disabled || loading;
  /**
   * Paired to each variant's *actual* fill, matching the label colours below.
   *
   * The danger variant fills with `dangerSoft`, not `danger`, so it takes
   * `danger` for its spinner rather than a white-ish `on*` token — which on
   * light mode's `#FBEAE8` would be roughly 1.1:1, i.e. invisible.
   */
  const spinnerColor = {
    primary: c.onPrimary,
    secondary: c.primaryOnSoft,
    ghost: c.primary,
    danger: c.danger,
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === 'secondary' && styles.secondaryLabel,
            variant === 'ghost' && styles.ghostLabel,
            variant === 'danger' && styles.dangerLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
};

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    field: { gap: spacing.xs },
    label: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.textMuted,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: HIT_SIZE,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      backgroundColor: c.surface,
      // Vertical padding lives on the input, so the glyph stays optically
      // centred against the text rather than the box.
      paddingHorizontal: spacing.md,
    },
    inputError: { borderColor: c.danger, backgroundColor: c.dangerSoft },
    icon: { marginRight: spacing.sm },
    input: {
      flex: 1,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.xs,
      fontSize: fontSize.md,
      color: c.text,
    },
    error: { fontSize: fontSize.xs, color: c.danger, fontWeight: fontWeight.medium },
    /**
     * `textMuted`, not `textSubtle`. The hint is 11 px text, and `textSubtle`
     * measures 3.53:1 on `surface` in light mode and 4.22:1 in dark — below the
     * 4.5:1 floor for normal text in both. A hint nobody can read is not a hint.
     */
    hint: { fontSize: fontSize.xs, color: c.textMuted },

    button: {
      minHeight: HIT_SIZE,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      flexDirection: 'row',
    },
    fullWidth: { alignSelf: 'stretch' },
    primary: { backgroundColor: c.primary },
    secondary: {
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primaryOutline,
    },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: c.dangerSoft, borderWidth: 1, borderColor: c.danger },
    pressed: { opacity: 0.82 },
    disabled: { opacity: 0.45 },
    buttonLabel: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.onPrimary,
    },
    secondaryLabel: { color: c.primaryOnSoft },
    ghostLabel: { color: c.primary },
    dangerLabel: { color: c.danger },
  });

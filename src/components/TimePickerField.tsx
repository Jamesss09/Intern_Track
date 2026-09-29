import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/FormField';
import {
  HOUR_LABELS,
  MINUTE_LABELS,
  formatTime12h,
  partsToTime24,
  timeToParts,
  type TimeParts,
} from '@/utils/dateFormatter';
import { fontSize, fontWeight, radius, spacing, HIT_SIZE, NUMERIC } from '@/constants/theme';

interface TimePickerFieldProps {
  /** Field label, e.g. `AM Time In`. Also the screen-reader name. */
  label: string;
  /** 24-hour `HH:MM`, or null when this session has not been filled in. */
  value: string | null;
  /**
   * Whether this field can be left empty.
   *
   * An afternoon-only shift is ordinary, so the PM fields are optional. The
   * button still says "Set" rather than being hidden, because a field a student
   * cannot see is a field they will not look for.
   */
  optional?: boolean;
  error?: string;
  hint?: string;
  onChange: (value: string | null) => void;
  /** 'AM' or 'PM'. Prefixes the sheet title and seeds the meridiem. */
  session: 'AM' | 'PM';
}

/**
 * A 12-hour time picker built in JS, in a bottom sheet.
 *
 * **`@react-native-community/datetimepicker` is deliberately not used.** It is
 * native code, so it is not in the Expo Go bundle — adding it would take this app
 * out of Expo Go entirely, which is the one architectural constraint that has
 * held since the project started. → [[Open Questions#Resolved|R8]]
 *
 * The same reasoning already ruled out a native date picker for the records
 * filter, and the date field on this form is a hand-built `CalendarPicker`. A
 * clock is no harder than a calendar grid, and the two now look and behave alike.
 *
 * Three columns — meridiem, hour, minute — rather than a wheel, because a wheel
 * needs momentum physics and a snapping algorithm to be usable and neither is
 * worth carrying. Tapping three lists is unambiguous, works with a screen
 * reader, and cannot leave a value half-selected.
 *
 * **Minutes step by one, not by five.** Quarter-hour granularity is a
 * reasonable default for a new time entry, but a supervisor's sign-off is not
 * approximate, and a picker that cannot produce 08:07 forces a student onto a
 * different screen to record what they actually worked. The list is 60 short
 * items; `ScrollView` handles that without a windowing problem.
 */
export const TimePickerField = ({
  label,
  value,
  optional = false,
  error,
  hint,
  onChange,
  session,
}: TimePickerFieldProps) => {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [open, setOpen] = useState(false);
  /**
   * The draft being edited, seeded when the sheet opens.
   *
   * Editing a draft rather than the live value is what makes Cancel free: the
   * student's half-finished choice is discarded by closing the sheet, rather
   * than being written to the form and then being impossible to undo without
   * remembering what was there before.
   *
   * Seeded in the press handler rather than by an effect watching `open`, so the
   * draft is always exactly one render behind the gesture that asked for it — an
   * effect would first paint a stale draft and then correct it.
   */
  const [draft, setDraft] = useState<TimeParts>({ hour: 8, minute: 0, meridiem: 'AM' });

  const openSheet = () => {
    setDraft(value ? timeToParts(value) : timeToParts(session === 'PM' ? '13:00' : '08:00'));
    setOpen(true);
  };

  const confirm = () => {
    onChange(partsToTime24(draft));
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setOpen(false);
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        onPress={openSheet}
        style={({ pressed }) => [styles.row, !!error && styles.rowError, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ? formatTime12h(value) : 'not set'}`}
        accessibilityHint="Opens a clock to choose a time"
      >
        <Ionicons name="time-outline" size={18} color={c.textSubtle} />
        <Text style={[styles.value, !value && styles.valueEmpty]}>
          {value ? formatTime12h(value) : 'Not set'}
        </Text>
        {value ? (
          <Ionicons name="close-circle" size={18} color={c.textSubtle} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
        )}
      </Pressable>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={`${label}`}>
        <View style={styles.preview}>
          <Text style={styles.previewTime}>{formatTime12h(partsToTime24(draft))}</Text>
        </View>

        <View style={styles.meridiem} accessibilityRole="radiogroup">
          {(['AM', 'PM'] as const).map((option) => {
            const active = draft.meridiem === option;
            return (
              <Pressable
                key={option}
                onPress={() => setDraft((prev) => ({ ...prev, meridiem: option }))}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={option}
                style={({ pressed }) => [
                  styles.meridiemItem,
                  active && styles.meridiemItemActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.meridiemLabel, active && styles.meridiemLabelActive]}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/**
         * Two plain `ScrollView` columns, not two `FlatList`s.
         *
         * `BottomSheet` already wraps its children in a vertical `ScrollView`, and
         * a `FlatList` inside one is warned against by React Native: windowing
         * cannot work when the outer `ScrollView` is already the thing deciding
         * what is on screen. The hour column was a `ScrollView` from the start and
         * the minute column was a `FlatList` — the inconsistency cost a dev warning
         * on every render of the form and bought nothing.
         *
         * Nothing is lost by dropping virtualisation here. The columns are capped
         * at 220 px and hold 12 and 60 short `Pressable`s; even fully mounted that
         * is a few dozen views, which is not a windowing problem. Minutes stepping
         * by one is worth 60 rows rather than a 5-minute step, and a `ScrollView`
         * is the right tool for 60 rows.
         */}
        <View style={styles.columns}>
          <TimeColumn
            caption="Hour"
            values={HOUR_LABELS}
            render={(hour) => String(hour)}
            selected={draft.hour}
            onSelect={(hour) => setDraft((prev) => ({ ...prev, hour }))}
          />
          <TimeColumn
            caption="Minute"
            values={MINUTE_LABELS}
            render={(minute) => String(minute).padStart(2, '0')}
            selected={draft.minute}
            onSelect={(minute) => setDraft((prev) => ({ ...prev, minute }))}
          />
        </View>

        <View style={styles.actions}>
          <Button label="Cancel" onPress={() => setOpen(false)} variant="secondary" fullWidth />
          <Button label={`Set ${session}`} onPress={confirm} fullWidth />
        </View>

        {optional && value ? (
          <Button label={`Clear ${session} session`} onPress={clear} variant="ghost" fullWidth />
        ) : null}
      </BottomSheet>
    </View>
  );
};

/**
 * One scrollable column of the clock.
 *
 * Extracted rather than written twice so the two columns cannot drift — which is
 * how they ended up as one `ScrollView` and one `FlatList` in the first place.
 */
const TimeColumn = ({
  caption,
  values,
  render,
  selected,
  onSelect,
}: {
  caption: string;
  values: readonly number[];
  render: (value: number) => string;
  selected: number;
  onSelect: (value: number) => void;
}) => {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <View style={styles.column}>
      <Text style={styles.columnCaption}>{caption}</Text>
      <ScrollView
        style={styles.columnScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.columnContent}
      >
        {values.map((value) => (
          <Option
            key={value}
            label={render(value)}
            selected={selected === value}
            onPress={() => onSelect(value)}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const Option = ({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) => {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && !selected && styles.pressed,
      ]}
    >
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
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
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: HIT_SIZE,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      backgroundColor: c.surface,
      paddingHorizontal: spacing.md,
    },
    rowError: { borderColor: c.danger, backgroundColor: c.dangerSoft },
    rowPressed: { backgroundColor: c.primarySoft, borderColor: c.primaryOutline },
    value: {
      flex: 1,
      ...NUMERIC,
      fontSize: fontSize.md,
      color: c.text,
    },
    /**
     * `textMuted`, not `textSubtle`: "Not set" is a value the student is being
     * offered rather than decoration, and it has to clear 4.5:1.
     */
    valueEmpty: { color: c.textMuted },
    error: { fontSize: fontSize.xs, color: c.danger, fontWeight: fontWeight.medium },
    hint: { fontSize: fontSize.xs, color: c.textMuted },

    preview: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      marginBottom: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: c.primarySoft,
    },
    previewTime: {
      ...NUMERIC,
      fontSize: fontSize.xxl,
      fontWeight: fontWeight.bold,
      color: c.primaryOnSoft,
    },

    meridiem: {
      flexDirection: 'row',
      gap: spacing.xs,
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.md,
      padding: spacing.xs,
      marginBottom: spacing.lg,
    },
    meridiemItem: {
      flex: 1,
      minHeight: HIT_SIZE - spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
    },
    meridiemItemActive: { backgroundColor: c.primary },
    meridiemLabel: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.medium,
      color: c.textMuted,
    },
    meridiemLabelActive: { color: c.onPrimary, fontWeight: fontWeight.bold },

    columns: { flexDirection: 'row', gap: spacing.md },
    column: { flex: 1, gap: spacing.xs },
    columnCaption: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    /** A fixed height so the two columns scroll against each other rather than
     *  the whole sheet growing to 60 rows. */
    columnScroll: { maxHeight: 220 },
    columnContent: { gap: spacing.xxs, paddingVertical: spacing.xxs },

    option: {
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
    },
    optionSelected: { backgroundColor: c.primarySoft },
    optionLabel: { ...NUMERIC, fontSize: fontSize.md, color: c.text },
    optionLabelSelected: { color: c.primary, fontWeight: fontWeight.bold },
    pressed: { opacity: 0.6 },

    actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  });

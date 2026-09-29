import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { buildMonthCells, monthLabel, todayIso } from '@/utils/dateFormatter';
import { RESTRICTION_HINT } from '@/utils/dateRestriction';
import { fontSize, fontWeight, radius, spacing, HIT_SIZE } from '@/constants/theme';

/** Monday-first, matching the app's `en-GB` date formatting elsewhere. */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

interface CalendarPickerProps {
  /** ISO date currently in the form. */
  selected: string;
  /** Called with an ISO date when the user taps the one selectable day. */
  onSelect: (iso: string) => void;
  /**
   * The one selectable day. Injectable rather than read from the clock inside,
   * so the grid can be rendered for an arbitrary "today" in a test.
   */
  today?: string;
}

/**
 * A month grid in which **only today is selectable**.
 *
 * Written rather than installed, because `@react-native-community/datetimepicker`
 * is native code and would take the app out of Expo Go — the same constraint
 * that ruled out a native picker for the records filter. A grid of `View`s and
 * one `Pressable` is pure JS, so it runs in Expo Go unchanged.
 *
 * It also buys something the native picker cannot do cheaply: a per-day enabled
 * flag. `minimumDate`/`maximumDate` would have to be set to the same day on both
 * bounds, which the platform dialogs either reject or render as an empty
 * calendar with no explanation.
 *
 * **No month navigation.** Every other day in every other month is disabled, so
 * an arrow would only ever move the user to a wall of grey. The restriction is
 * legible from the current month alone: yesterday and tomorrow are visibly
 * muted, and the hint above says why.
 */
export const CalendarPicker = ({ selected, onSelect, today = todayIso() }: CalendarPickerProps) => {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const cells = useMemo(() => buildMonthCells(today), [today]);

  const selectable = (iso: string) => iso === today;

  return (
    <View style={styles.container}>
      <Text style={styles.month}>{monthLabel(today)}</Text>

      <View style={styles.hintRow}>
        <Ionicons name="lock-closed-outline" size={14} color={c.textMuted} />
        <Text style={styles.hint}>{RESTRICTION_HINT}</Text>
      </View>

      <View style={styles.grid}>
        {WEEKDAYS.map((label) => (
          <View key={label} style={styles.cell}>
            <Text style={styles.weekday}>{label}</Text>
          </View>
        ))}

        {cells.map((iso, index) => {
          // Empty padding cell before the 1st — no day, so it is not focusable
          // and must not be announced as a blank day.
          if (iso === null) {
            return <View key={`pad-${index}`} style={styles.cell} />;
          }

          const isEnabled = selectable(iso);
          const isSelected = iso === selected;
          const day = Number(iso.slice(8, 10));

          return (
            <View key={iso} style={styles.cell}>
              <Pressable
                onPress={() => onSelect(iso)}
                disabled={!isEnabled}
                style={[
                  styles.day,
                  // A record being edited can hold a past date. It is shown, but
                  // never offered as a choice — the tint marks it as already
                  // recorded rather than as a day the user may pick again.
                  !isEnabled && isSelected && styles.dayClosed,
                  isEnabled && isSelected && styles.daySelected,
                ]}
                /**
                 * Only the today cell is pressable, so its slop can safely
                 * extend over the inert neighbours around it — there is no
                 * competing press target for it to steal from. This is what
                 * recovers the 48 dp target on a 320 dp screen, where seven
                 * columns leave only ~41 dp each.
                 */
                hitSlop={isEnabled ? 6 : 0}
                accessibilityRole="button"
                accessibilityLabel={`${monthLabel(today)} ${day}`}
                accessibilityState={{ disabled: !isEnabled, selected: isSelected }}
                accessibilityHint={isEnabled ? undefined : 'Only today can be recorded'}
              >
                <Text
                  style={[
                    styles.dayText,
                    !isEnabled && styles.dayTextDisabled,
                    isEnabled && styles.dayTextSelectable,
                    isEnabled && isSelected && styles.dayTextSelected,
                  ]}
                >
                  {day}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    container: { gap: spacing.md },
    month: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.text,
      textAlign: 'center',
    },
    hintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
    },
    /**
     * `textMuted`, not `textSubtle` — at 11 px the hint is body text, and
     * `textSubtle` measures 3.53:1 on `surface`, under the 4.5:1 floor. This
     * line is the only place that explains *why* most of the grid is inert.
     */
    hint: { fontSize: fontSize.xs, color: c.textMuted, flexShrink: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: {
      width: `${100 / 7}%`,
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekday: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.textMuted,
    },
    day: {
      width: HIT_SIZE - 12,
      height: HIT_SIZE - 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
    },
    daySelected: { backgroundColor: c.primary },
    dayClosed: {
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    dayText: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.medium,
      color: c.text,
    },
    /**
     * Disabled days are `textSubtle` (3.53:1 on `surface`), which is under the
     * 4.5:1 floor for body text. That is deliberate and is the one sanctioned
     * exception: WCAG 1.4.3 excludes *inactive* controls from the contrast
     * requirement, and this cell is exactly that. The disabled state is
     * additionally carried by `accessibilityState` for screen readers, so it is
     * not a colour-only signal.
     */
    dayTextDisabled: { color: c.textSubtle },
    dayTextSelectable: { fontWeight: fontWeight.bold },
    dayTextSelected: { color: c.onPrimary },
  });

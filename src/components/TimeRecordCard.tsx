import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import type { TimeRecord } from '@/types';
import { fontSize, fontWeight, radius, scaledLine, spacing, NUMERIC } from '@/constants/theme';
import {
  formatDateWithWeekday,
  formatDayOfMonth,
  formatMonthAbbrev,
  formatTimeRange,
} from '@/utils/dateFormatter';
import { formatBreak, formatHours } from '@/utils/progressCalculator';

interface TimeRecordCardProps {
  record: TimeRecord;
  onPress?: (record: TimeRecord) => void;
  /**
   * The placement's date window, used to flag an entry logged outside it.
   * Omit it and no status dot is drawn at all.
   */
  placement?: { start_date: string; end_date: string | null };
}

/**
 * One logged day, as shown in the records list: a day-number block, the date,
 * the hours, the time range, and a status dot.
 *
 * The dot is **not** decorative. The mockup shows a green dot on every row, but
 * a marker that reads the same on every row tells the user nothing, and an
 * inert status affordance is worse than none — so it encodes a real check: the
 * day falls inside the placement window (green) or outside it (amber). A day
 * logged outside the placement is exactly the kind of thing a school rejects at
 * sign-off, and until now nothing on this screen surfaced it.
 *
 * Colour alone is not the only signal — the row's accessibility label says so
 * in words, which is what carries the meaning for a screen reader.
 */
export const TimeRecordCard = ({ record, onPress, placement }: TimeRecordCardProps) => {
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const hours = formatHours(record.total_hours);
  const dateLabel = formatDateWithWeekday(record.date);

  /**
   * ISO dates compare correctly as plain strings, so this is a lexicographic
   * check and not a date parse — which is also why `date` is stored as
   * `YYYY-MM-DD` rather than a timestamp.
   */
  const outsidePlacement =
    !!placement &&
    (record.date < placement.start_date ||
      (!!placement.end_date && record.date > placement.end_date));

  const status = outsidePlacement ? 'outside your placement dates' : 'within your placement';

  const body = (
    <View style={styles.row}>
      {/* Decorative: the full date is already in the row's own label, so
          announcing the block separately would read the day twice. */}
      <View style={styles.dateBlock} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.dateBlockDay}>{formatDayOfMonth(record.date)}</Text>
        <Text style={styles.dateBlockMonth}>{formatMonthAbbrev(record.date)}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.date} numberOfLines={1}>
            {dateLabel}
          </Text>
          <Text style={styles.hours}>{hours}</Text>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.times} numberOfLines={1}>
            {formatTimeRange(record.time_in, record.time_out)}
          </Text>
          <View
            style={[styles.dot, outsidePlacement ? styles.dotOutside : styles.dotWithin]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={styles.times}>{formatBreak(record.break_minutes)}</Text>
        </View>

        {record.notes ? (
          <Text style={styles.notes} numberOfLines={2}>
            {record.notes}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View
        style={[styles.card, elevation.sm]}
        accessibilityLabel={`${dateLabel}, ${hours} hours, ${status}`}
      >
        {body}
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.card, elevation.sm, pressed && styles.pressed]}
      onPress={() => onPress(record)}
      accessibilityRole="button"
      accessibilityLabel={`${dateLabel}, ${hours} hours, ${status}`}
      accessibilityHint="Opens this day to edit or delete it"
    >
      {body}
    </Pressable>
  );
};

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    pressed: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.borderStrong,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    body: { flex: 1, gap: spacing.xs },

    dateBlock: {
      width: 52,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      gap: 1,
    },
    dateBlockDay: {
      ...NUMERIC,
      fontSize: fontSize.xl,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    dateBlockMonth: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: spacing.sm,
    },
    date: {
      flex: 1,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },
    hours: {
      ...NUMERIC,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.primary,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    times: {
      fontSize: fontSize.sm,
      color: c.textMuted,
    },
    /** Separates the time range from the break, replacing "Break: ". */
    dot: { width: 6, height: 6, borderRadius: 3 },
    dotWithin: { backgroundColor: c.success },
    dotOutside: { backgroundColor: c.warning },
    notes: {
      fontSize: fontSize.sm,
      color: c.textMuted,
      lineHeight: scaledLine(fontSize.sm, 1.45),
    },
  });

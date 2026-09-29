import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/FormField';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getDatabase } from '@/database/database';
import * as pdfService from '@/services/pdfService';
import * as timeRecordService from '@/services/timeRecordService';
import { formatHours } from '@/utils/progressCalculator';
import { minutesToHours } from '@/utils/timeCalculator';
import { courseBlock } from '@/utils/tmcFormTemplate';
import { monthLabel, daysInMonthIso, shiftMonthIso, startOfMonthIso, todayIso } from '@/utils/dateFormatter';
import {
  contentWidth,
  fontSize,
  fontWeight,
  radius,
  scaledLine,
  spacing,
  HIT_SIZE,
} from '@/constants/theme';

type Action = 'generate' | 'print' | 'save';

/**
 * Two documents, two audiences.
 *
 * The TMC sheet is the one the school signs, and it is a fixed form: one month
 * per page, 31 numbered days whether or not the month has 31, no totals block.
 * The detailed log is the one the student checks their own hours against, and it
 * is a list. Keeping both rather than replacing one with the other is
 * → [[Decisions#D-017 — Two PDF formats, not one replacement]].
 */
type Format = 'tmc' | 'detail';

/**
 * What the selected month actually holds, so the screen never guesses at it.
 *
 * Tagged with the month it describes. The read is asynchronous and the student
 * can step the arrow while it is in flight, and a bare `{ dayCount, hours }` would
 * show September's numbers under October's heading in between. Keying it means
 * the render can simply ignore anything that is not the month on screen, with no
 * effect needed to clear the stale value first.
 */
interface MonthStats {
  month: string;
  /**
   * `null` when the read has not landed or failed; `0` is a real, checked
   * answer — the difference between "unknown" and "nothing there", and the whole
   * empty-month warning rests on not conflating them.
   */
  dayCount: number | null;
  hours: number;
}

/**
 * The months that hold records, as first-of-month `YYYY-MM-DD` keys.
 *
 * Kept as plain strings rather than `MonthSummary`s because the only thing the
 * screen needs from them is a set of reachable months — for the stepper's bounds
 * and for the "your records are over there" warning.
 *
 * The database hands these over as `YYYY-MM`; `listMonthsWithRecords`' effect
 * above converts them. Every comparison against `bounds` below is
 * lexicographic, and the two shapes are not interchangeable: `'2026-09'` is a
 * prefix of `'2026-09-01'`, so it sorts *before* it and passes a `>=` test that
 * was meant to exclude it.
 */
type MonthList = string[];

/**
 * How many months to name before collapsing the rest.
 *
 * A student back-filling a whole year has twelve months of records and no reason
 * to read a paragraph listing them. Three is enough to recognise "they are all
 * in autumn" without turning the warning into a table.
 */
const NAMED_MONTHS = 3;

/** `September 2026, October 2026 and November 2026` — or three plus a count. */
const describeMonths = (months: MonthList): string => {
  const named = months.slice(-NAMED_MONTHS).map((m) => monthLabel(m));
  const extra = months.length - named.length;
  const list =
    named.length === 1
      ? named[0]
      : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  return extra > 0 ? `${list}, plus ${extra} more` : list;
};

export default function PrintRecordsScreen() {
  const { user, internship, summary } = useApp();
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [format, setFormat] = useState<Format>('tmc');
  const [busy, setBusy] = useState<Action | null>(null);
  const [result, setResult] = useState<pdfService.GeneratedRecord | null>(null);
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null);
  const [monthsWithRecords, setMonthsWithRecords] = useState<MonthList>([]);

  /**
   * The month the TMC sheet covers, as a first-of-month key.
   *
   * Clamped into the placement window on both sides. The upper bound is today
   * rather than the end of the placement, because a month with nothing in it
   * and no days left to log is a blank form; if the placement was set up with an
   * end date already in the past, the clamp falls back to the start month so the
   * stepper is never left with `min > max` and both arrows permanently dead.
   *
   * **Widened by the months that actually hold records.** A month with records
   * is always reachable, because the whole point of the empty-month warning is
   * to offer a jump into it — and a jump the clamp would immediately undo would
   * leave the student pressing the same dead month twice.
   */
  const bounds = useMemo(() => {
    if (!internship) return null;
    const placementFirst = startOfMonthIso(internship.start_date);
    const now = startOfMonthIso(todayIso());
    const placementLast = now < placementFirst ? placementFirst : now;

    if (monthsWithRecords.length === 0) return { first: placementFirst, last: placementLast };

    // `YYYY-MM` sorts lexicographically, so the extremes are the min and max.
    return {
      first: monthsWithRecords[0] < placementFirst ? monthsWithRecords[0] : placementFirst,
      last: monthsWithRecords[monthsWithRecords.length - 1] > placementLast
        ? monthsWithRecords[monthsWithRecords.length - 1]
        : placementLast,
    };
  }, [internship, monthsWithRecords]);

  const [monthIso, setMonthIso] = useState<string | null>(null);

  // Derived rather than stored, so the stepper can never leave the selection
  // outside the placement window. `null` until the placement is known.
  const month = bounds
    ? monthIso && monthIso >= bounds.first && monthIso <= bounds.last
      ? monthIso
      : bounds.last
    : null;

  const atFirstMonth = month !== null && bounds !== null && month <= bounds.first;
  const atLastMonth = month !== null && bounds !== null && month >= bounds.last;

  /**
   * The selected month's real figures.
   *
   * Fetched rather than filtered from `summary`, because `summary.completed` is
   * the *whole placement*: showing it under "Hours logged in that month" told a
   * student with 40 days in May that May held all 40 of them, which was simply
   * false and was half of why a blank September sheet looked correct.
   * → [[PDF Export#The blank form bug]]
   */
  useEffect(() => {
    if (!internship || format !== 'tmc' || !month) return;

    let cancelled = false;

    void Promise.all([
      timeRecordService.getMonthAttendance(internship.id, month),
      timeRecordService.listMonthsWithRecords(internship.id),
    ])
      .then(([attendance, months]) => {
        if (cancelled) return;
        setMonthStats({ month, dayCount: attendance.day_count, hours: attendance.total_hours });
        /**
         * The database names a month `YYYY-MM` — `listMonthsWithRecords` groups
         * with `substr(date, 1, 7)`. Every other key on this screen is a
         * first-of-month `YYYY-MM-DD`, because `startOfMonthIso`, `shiftMonthIso`
         * and every comparison against `bounds` are built on that shape.
         *
         * Convert here, at the one point the database's format enters the app.
         * Left unconverted it fails quietly rather than loudly: `'2026-09'` and
         * `'2026-09-01'` both look like valid months, and the lexicographic
         * comparisons that guard `bounds` are all true in the direction that
         * admits the short one, so it survives every check and then produces
         * `NaN` bounds, a query that matches no rows, and a sheet with an empty
         * table. → [[PDF Export#Month Selection]]
         */
        setMonthsWithRecords(months.map((m) => startOfMonthIso(`${m.month}-01`)));
      })
      // A failed stats read is not worth interrupting an export over. It leaves
      // the count unknown rather than zero, so a month whose read failed is never
      // mistaken for an empty one, and `generateTmcFormPdf` still throws its own
      // error if the month really has nothing in it.
      .catch(() => {
        if (!cancelled) setMonthStats({ month, dayCount: null, hours: 0 });
      });

    return () => {
      cancelled = true;
    };
  }, [internship, format, month]);

  /**
   * The stats for the month currently on screen, or null while they are unread.
   *
   * Derived rather than stored-and-cleared: a record tagged with another month is
   * stale by definition, and discarding it in the effect body would be a
   * synchronous `setState` and a second render pass on every arrow press.
   */
  const stats = monthStats && monthStats.month === month ? monthStats : null;

  /**
   * The month to jump to when the selected one holds nothing.
   *
   * The nearest one to the current selection rather than simply the last: a
   * student who has stepped back from September to August wants August's nearest
   * populated neighbour, not a jump forward past the month they were looking at.
   */
  const nearestMonthWithRecords = useMemo(() => {
    if (!month || monthsWithRecords.length === 0) return null;
    const before = monthsWithRecords.filter((m) => m < month).pop();
    const after = monthsWithRecords.find((m) => m > month);
    return before ?? after ?? monthsWithRecords[monthsWithRecords.length - 1];
  }, [month, monthsWithRecords]);

  /** True when this sheet would print blank and the placement is not empty. */
  const emptyMonthWarning = useMemo(() => {
    if (format !== 'tmc' || !month || !stats || stats.dayCount === null) return false;
    return stats.dayCount === 0 && monthsWithRecords.length > 0;
  }, [format, month, stats, monthsWithRecords]);

  const reset = useCallback(() => {
    setResult(null);
  }, []);

  const stepMonth = useCallback(
    (delta: number) => {
      if (!month) return;
      const next = shiftMonthIso(month, delta);
      if (bounds && (next < bounds.first || next > bounds.last)) return;
      setMonthIso(next);
      reset();
    },
    [month, bounds, reset],
  );

  /**
   * Changing format or month invalidates the document already rendered.
   *
   * The result is a rendered document describing a specific month. Left in
   * place, a student who switched from the TMC sheet to the detailed log would
   * press Save File and write September's school form to their Downloads folder
   * while the screen reads "Detailed Log" — the saved file's real name is the
   * only clue, so it looks like it worked.
   */
  const chooseFormat = useCallback(
    (next: Format) => {
      setFormat(next);
      reset();
    },
    [reset],
  );

  const fileName = useMemo(
    () => (format === 'tmc' && month ? pdfService.tmcFileName(month) : pdfService.logFileName()),
    [format, month],
  );

  const documentTitle = useMemo(
    () => (format === 'tmc' && month ? `OJT Daily Time Record — ${monthLabel(month)}` : 'OJT Time Record'),
    [format, month],
  );

  /**
   * Render the document, or return the one already rendered.
   *
   * Shared by both outputs so Save and the on-screen summary cannot disagree
   * about which document they describe. Returns `null` on failure, having
   * already told the user why.
   */
  const ensureGenerated = useCallback(async (): Promise<pdfService.GeneratedRecord | null> => {
    if (!user || !internship) return null;
    // The detailed log covers the whole placement, so it has no month. Only the
    // TMC sheet is month-scoped, and it is never generated without one.
    if (format === 'tmc' && !month) return null;
    if (result) return result;

    setBusy('generate');
    try {
      const db = await getDatabase();
      const generated =
        format === 'tmc'
          ? await pdfService.generateTmcFormPdf(db, user, internship, month as string)
          : await pdfService.generateOjtRecordPdf(db, user, internship);
      setResult(generated);
      return generated;
    } catch (error) {
      /**
       * The backstop behind the inline warning.
       *
       * `TmcMonthEmptyError` is not a generic failure: it knows which months do
       * hold records, so the response is a jump to one of them rather than
       * "check for duplicate days". Anything else is a real error.
       */
      if (error instanceof pdfService.TmcMonthEmptyError) {
        // The same month the inline warning would have offered, so both paths
        // land the student in the same place.
        const target = nearestMonthWithRecords;
        Alert.alert(
          `Nothing logged in ${month ? monthLabel(month) : 'that month'}`,
          target
            ? `${error.message} Open ${monthLabel(target)} instead?`
            : error.message,
          target
            ? [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: `Open ${monthLabel(target)}`,
                  onPress: () => {
                    setMonthIso(target);
                    reset();
                  },
                },
              ]
            : [{ text: 'OK' }],
        );
      } else {
        Alert.alert(
          'Could not create the PDF',
          error instanceof Error ? error.message : 'Unknown error.',
        );
      }
      return null;
    } finally {
      setBusy(null);
    }
  }, [user, internship, format, month, result, reset, nearestMonthWithRecords]);

  /**
   * Keep a real file the student can find again.
   *
   * The old screen had one "Share / Save" button, which opened the system share
   * sheet and hoped the student found "Save to Files" inside it — and on Android
   * the sheet's destinations are chosen by the *receiver*, so a destination with
   * no save option silently offered nothing at all. Save is now its own action,
   * and it is deliberately not the same action on both platforms: iOS writes into
   * `Documents/`, which the Files app browses, while Android asks which folder,
   * because its document directory is app-private and a file saved there is one
   * the student can never find again.
   * → [[PDF Export#Where the file goes]]
   */
  const onSave = useCallback(async () => {
    const generated = await ensureGenerated();
    if (!generated) return;

    setBusy('save');
    try {
      const outcome = await pdfService.savePdf(generated.base64, fileName);

      // Backing out of the folder picker is a decision, not a failure.
      if (outcome.status === 'cancelled') return;

      const { name, location } = outcome.file;
      Alert.alert('Saved', `${name}\n\n${location}.`);
    } catch (error) {
      Alert.alert(
        'Could not save the file',
        error instanceof Error ? error.message : 'Unknown error.',
      );
    } finally {
      setBusy(null);
    }
  }, [ensureGenerated, fileName]);

  /**
   * Print goes through the service rather than through the generated file, so it
   * re-reads the database at the moment of printing. That is what lets a student
   * log another day, come back and press Print without first pressing Create.
   */
  const onPrint = useCallback(async () => {
    if (!user || !internship) return;
    if (format === 'tmc' && !month) return;

    setBusy('print');
    try {
      const db = await getDatabase();
      if (format === 'tmc') {
        await pdfService.printTmcForm(db, user, internship, month as string);
      } else {
        await pdfService.printRecord(db, user, internship);
      }
    } catch (error) {
      if (error instanceof pdfService.TmcMonthEmptyError) {
        Alert.alert('Nothing to print', error.message);
      } else {
        Alert.alert(
          'Printing failed',
          error instanceof Error ? error.message : 'Unknown error.',
        );
      }
    } finally {
      setBusy(null);
    }
  }, [user, internship, format, month]);

  if (!user || !internship || !summary) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="OJT Record" onBack={() => router.back()} />
        <View style={styles.container}>
          <EmptyState
            title="Nothing to print yet"
            message="Set up your OJT details and log some days first."
            action={
              <Link href="/internship-setup" asChild>
                <Button label="Add OJT Details" onPress={() => {}} />
              </Link>
            }
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScreenHeader title="OJT Record" subtitle={internship.company_name} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, elevation.sm]}>
          <Text style={styles.cardTitle}>Format</Text>
          {/*
            A two-up segmented control rather than two buttons. Both documents
            are equally valid outputs, so neither may read as the primary
            action; a primary/secondary pair would tell the student which one the
            app thinks matters, and that is not the app's call.
          */}
          <View style={styles.segment} accessibilityRole="radiogroup">
            {(
              [
                { key: 'tmc' as const, label: 'TMC Form', hint: 'One month per sheet, for the supervisor to sign' },
                { key: 'detail' as const, label: 'Detailed Log', hint: 'Every day logged, with break and running total' },
              ] satisfies { key: Format; label: string; hint: string }[]
            ).map((option) => {
              const active = format === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => chooseFormat(option.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={option.label}
                  accessibilityHint={option.hint}
                  style={({ pressed }) => [
                    styles.segmentItem,
                    active && styles.segmentItemActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/*
            Preset arrows, not a date picker, for the same reason the records
            filter uses presets: `@react-native-community/datetimepicker` is
            native code and would take the app out of Expo Go
            → [[Open Questions#Resolved]]. A month is also a coarser thing than
            a date — a student back-filling September wants September, not a
            calendar to aim at.
          */}
          {format === 'tmc' && month ? (
            <View style={styles.monthBlock}>
              <Text style={styles.monthCaption}>Month</Text>
              <View style={styles.monthRow}>
                <Pressable
                  onPress={() => stepMonth(-1)}
                  disabled={atFirstMonth}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  accessibilityState={{ disabled: !!atFirstMonth }}
                  style={({ pressed }) => [
                    styles.monthArrow,
                    atFirstMonth && styles.monthArrowOff,
                    pressed && !atFirstMonth && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={atFirstMonth ? c.textSubtle : c.primary}
                  />
                </Pressable>

                <Text style={styles.monthLabel} accessibilityRole="header">
                  {monthLabel(month)}
                </Text>

                <Pressable
                  onPress={() => stepMonth(1)}
                  disabled={atLastMonth}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  accessibilityState={{ disabled: !!atLastMonth }}
                  style={({ pressed }) => [
                    styles.monthArrow,
                    atLastMonth && styles.monthArrowOff,
                    pressed && !atLastMonth && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={atLastMonth ? c.textSubtle : c.primary}
                  />
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        {/*
          The school's sheet has no totals block, so the hours the student
          verifies against live here rather than on the page. A form that
          disagreed with the Progress screen is the failure this app cannot
          afford → [[PDF Export#Implementation Notes]].
        */}
        <View style={[styles.card, elevation.sm]}>
          <Text style={styles.cardTitle}>What will be printed</Text>

          {format === 'tmc' ? (
            <>
              <ListRow icon="person-outline" label="Name" value={user.full_name} />
              <ListRow icon="business-outline" label="Office" value={internship.company_name} />
              <ListRow
                icon="school-outline"
                label="Course / Block"
                value={courseBlock(user) || 'Not set on your profile'}
              />
              <ListRow
                icon="calendar-outline"
                label="Period"
                value={
                  internship.end_date
                    ? `${internship.start_date} → ${internship.end_date}`
                    : `${internship.start_date} → Ongoing`
                }
              />
              <ListRow
                icon="document-text-outline"
                label="Sheet covers"
                value={
                  month
                    ? `${monthLabel(month)} · ${daysInMonthIso(month)} dated rows`
                    : '—'
                }
              />
              {/**
                How many of those rows will carry attendance.
                *
                This is the screen's answer to "why is my sheet blank?", shown
                * before anything is generated rather than inferred afterwards from
                * a file that looks the same either way.
                *
                * The denominator is the month's real length, not a hardcoded 31.
                * `buildDayRows` emits one row per real day, so a September sheet has
                * 30 of them — telling the student 31 here would have them hunting
                * for a 31st row that was never printed.
                */}
              <ListRow
                icon="checkmark-circle-outline"
                label="Rows with attendance"
                value={
                  !month || !stats || stats.dayCount === null
                    ? 'Checking…'
                    : `${stats.dayCount} of ${daysInMonthIso(month)}${
                        stats.dayCount > 0 ? ` · ${formatHours(stats.hours)} hrs` : ''
                      }`
                }
              />
              <ListRow icon="trending-up-outline" label="Progress to date" value={`${summary.percent}%`} />
            </>
          ) : (
            <>
              <ListRow icon="person-outline" label="Student" value={user.full_name} />
              <ListRow icon="business-outline" label="Company" value={internship.company_name} />
              <ListRow icon="briefcase-outline" label="Position" value={internship.position} />
              <ListRow
                icon="time-outline"
                label="Required hours"
                value={`${formatHours(summary.required)} hrs`}
              />
              <ListRow
                icon="checkmark-circle-outline"
                label="Completed hours"
                value={`${formatHours(summary.completed)} hrs`}
              />
              <ListRow
                icon="hourglass-outline"
                label="Remaining hours"
                value={`${formatHours(summary.remaining)} hrs`}
              />
              <ListRow icon="calendar-outline" label="Days logged" value={String(summary.dayCount)} />
              <ListRow icon="trending-up-outline" label="Progress" value={`${summary.percent}%`} />
            </>
          )}
        </View>

        {/**
          Said before the button is pressed, not after.
          *
          The original bug was not that a wrong file was produced — it was that
          nothing distinguished a blank sheet from a correct one. A blank TMC form
          has the same letterhead, the same 31 numbered rows and the same signature
          lines as a filled one, so a student could not tell by looking, and neither
          could their supervisor. `pdfService` refuses to generate it at all; this
          is what stops them reaching for the button, and offers the way out.
          */}
        {emptyMonthWarning && month && nearestMonthWithRecords ? (
          <View style={[styles.warnCard, elevation.sm]}>
            <View style={styles.warnHeader}>
              <Ionicons name="alert-circle" size={18} color={c.warning} />
              <Text style={styles.warnTitle}>Nothing logged in {monthLabel(month)}</Text>
            </View>
            <Text style={styles.warnBody}>
              This sheet would print blank. Your records are in {describeMonths(monthsWithRecords)}.
            </Text>
            <Button
              label={`Go to ${monthLabel(nearestMonthWithRecords)}`}
              onPress={() => {
                setMonthIso(nearestMonthWithRecords);
                reset();
              }}
              variant="secondary"
              fullWidth
            />
          </View>
        ) : null}

        {result ? (
          <View style={[styles.readyCard, elevation.sm]}>
            <View style={styles.readyHeader}>
              <Ionicons name="checkmark-circle" size={18} color={c.success} />
              <Text style={styles.readyTitle}>PDF ready</Text>
            </View>
            {busy === 'generate' ? (
              <ActivityIndicator color={c.primary} />
            ) : (
              <Text style={styles.ready}>
                {documentTitle}.{'\n'}
                {result.numberOfPages} {result.numberOfPages === 1 ? 'page' : 'pages'} ·{' '}
                {result.recordCount} {result.recordCount === 1 ? 'day' : 'days'} ·{' '}
                {formatHours(minutesToHours(result.totalMinutes))} hrs.{'\n'}
                Save File writes a named PDF copy to a folder you choose.
              </Text>
            )}
          </View>
        ) : null}

        {/**
          Four actions rather than three, because a device has three genuinely
          different ways out of this screen and one of them was previously
          unreachable: Save was a line inside a share sheet, which on Android is
          a list of *receivers*, so a destination with no "save" affordance
          offered none at all. Generate is kept separate from the rest because it
          is the only one that tells the student something is wrong.
        */}
        <View style={styles.actions}>
          <Button
            label={format === 'tmc' ? 'Create TMC Form' : 'Create Detailed Log'}
            onPress={ensureGenerated}
            loading={busy === 'generate'}
            disabled={busy !== null && busy !== 'generate'}
            fullWidth
            accessibilityHint={
              format === 'tmc'
                ? 'Builds the school daily time record sheet for the selected month'
                : 'Builds the printable OJT record'
            }
          />
          <Button
            label="Save File"
            onPress={onSave}
            variant="secondary"
            loading={busy === 'save'}
            disabled={busy !== null && busy !== 'save'}
            fullWidth
            accessibilityHint={
              Platform.OS === 'android'
                ? 'Asks which folder to keep a named copy of the PDF in'
                : 'Keeps a named copy of the PDF in the Files app'
            }
          />
          <Button
            label="Print"
            onPress={onPrint}
            variant="secondary"
            loading={busy === 'print'}
            disabled={busy !== null && busy !== 'print'}
            fullWidth
            accessibilityHint="Opens the system print dialog, including wireless printers"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    container: {
      ...contentWidth,
      padding: spacing.lg,
      gap: spacing.lg,
      paddingBottom: spacing.xxxl,
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    cardTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
      marginBottom: spacing.xs,
    },
    pressed: { opacity: 0.6 },

    /**
     * The active half fills with `primary` and the inactive with `surfaceAlt`,
     * so the selection is carried by fill *and* by weight, not by colour alone
     * — the same rule the rest of the app follows for state.
     */
    segment: {
      flexDirection: 'row',
      gap: spacing.xs,
      backgroundColor: c.surfaceAlt,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: spacing.xs,
    },
    segmentItem: {
      flex: 1,
      minHeight: HIT_SIZE - spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
    },
    segmentItemActive: { backgroundColor: c.primary },
    segmentLabel: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      color: c.textMuted,
      textAlign: 'center',
    },
    segmentLabelActive: { color: c.onPrimary, fontWeight: fontWeight.bold },

    monthBlock: { marginTop: spacing.md, gap: spacing.xs },
    monthCaption: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.textMuted,
    },
    monthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    monthArrow: {
      width: HIT_SIZE,
      height: HIT_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: c.primarySoft,
      borderWidth: 1,
      borderColor: c.primaryOutline,
    },
    monthArrowOff: { backgroundColor: c.surfaceAlt, borderColor: c.border },
    monthLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.text,
    },

    readyCard: {
      backgroundColor: c.successSoft,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.success,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    readyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    readyTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.success,
    },
    ready: {
      fontSize: fontSize.sm,
      color: c.text,
      lineHeight: scaledLine(fontSize.sm, 1.5),
    },

    /**
     * A caution, not an error.
     *
     * The student can legitimately want to print a blank sheet — a month they
     * have not worked yet — so this is `warning`, and it never blocks the button.
     * It exists because the placement holds records and *this* month does not,
     * which is the one case where the sheet would be handed in looking valid and
     * carrying nothing.
     */
    warnCard: {
      backgroundColor: c.warningSoft,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.warning,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    warnHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    warnTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.warning,
      flex: 1,
    },
    warnBody: {
      fontSize: fontSize.sm,
      color: c.text,
      lineHeight: scaledLine(fontSize.sm, 1.5),
      marginBottom: spacing.xs,
    },

    actions: { gap: spacing.md },
  });

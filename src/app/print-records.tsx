import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { BottomSheet } from '@/components/BottomSheet';
import { Button } from '@/components/FormField';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getDatabase } from '@/database/database';
import * as pdfService from '@/services/pdfService';
import { formatHours } from '@/utils/progressCalculator';
import { courseBlock } from '@/utils/tmcFormTemplate';
import { monthLabel, shiftMonthIso, startOfMonthIso, todayIso } from '@/utils/dateFormatter';
import {
  contentWidth,
  fontSize,
  fontWeight,
  radius,
  scaledLine,
  spacing,
  HIT_SIZE,
  NUMERIC,
} from '@/constants/theme';

type Action = 'generate' | 'print' | 'share';

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

export default function PrintRecordsScreen() {
  const { user, internship, summary } = useApp();
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [format, setFormat] = useState<Format>('tmc');
  const [busy, setBusy] = useState<Action | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  /**
   * The month the TMC sheet covers, as a first-of-month key.
   *
   * Clamped into the placement window on both sides. The upper bound is today
   * rather than the end of the placement, because a month with nothing in it
   * and no days left to log is a blank form; if the placement was set up with an
   * end date already in the past, the clamp falls back to the start month so the
   * stepper is never left with `min > max` and both arrows permanently dead.
   */
  const bounds = useMemo(() => {
    if (!internship) return null;
    const first = startOfMonthIso(internship.start_date);
    const now = startOfMonthIso(todayIso());
    const last = now < first ? first : now;
    return { first, last };
  }, [internship]);

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

  const stepMonth = useCallback(
    (delta: number) => {
      if (!month) return;
      const next = shiftMonthIso(month, delta);
      if (bounds && (next < bounds.first || next > bounds.last)) return;
      setMonthIso(next);
      setUri(null);
      setPages(null);
    },
    [month, bounds],
  );

  /**
   * Changing format or month invalidates the file already on disk.
   *
   * The `uri` is a path to a rendered document describing a specific month. Left
   * in place, a student who switched from the TMC sheet to the detailed log
   * would press Share and send September's school form while the screen reads
   * "Detailed Log" — the cache makes it look like it worked.
   */
  const chooseFormat = useCallback((next: Format) => {
    setFormat(next);
    setUri(null);
    setPages(null);
  }, []);

  const generate = useCallback(async () => {
    if (!user || !internship) return null;
    // The detailed log covers the whole placement, so it has no month. Only the
    // TMC sheet is month-scoped, and it is never generated without one.
    if (format === 'tmc' && !month) return null;

    setBusy('generate');
    setUri(null);
    try {
      const db = await getDatabase();
      const result =
        format === 'tmc'
          ? await pdfService.generateTmcFormPdf(db, user, internship, month as string)
          : await pdfService.generateOjtRecordPdf(db, user, internship);
      setUri(result.uri);
      setPages(result.numberOfPages);
      return result;
    } catch (error) {
      Alert.alert(
        'Could not create the PDF',
        error instanceof Error ? error.message : 'Unknown error.',
      );
      return null;
    } finally {
      setBusy(null);
    }
  }, [user, internship, format, month]);

  const shareTitle = format === 'tmc' && month ? `OJT Daily Time Record — ${monthLabel(month)}` : 'Share OJT Time Record';

  const onShare = useCallback(async () => {
    // Reuse an already-generated file; only build one if the screen was opened
    // straight into sharing.
    const target = uri ?? (await generate())?.uri;
    if (!target) return;

    setBusy('share');
    try {
      await pdfService.shareRecord(target, shareTitle);
    } catch (error) {
      Alert.alert(
        'Sharing unavailable',
        error instanceof Error
          ? error.message
          : 'Use "Save to Files" from the share sheet instead.',
      );
    } finally {
      setBusy(null);
    }
  }, [uri, generate, shareTitle]);

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
      Alert.alert(
        'Printing failed',
        error instanceof Error ? error.message : 'Unknown error.',
      );
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
                value={month ? `${monthLabel(month)} · 31 dated rows` : '—'}
              />
              <ListRow
                icon="checkmark-circle-outline"
                label="Hours logged in that month"
                value={formatHours(summary.completed)}
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

        {uri ? (
          <View style={[styles.readyCard, elevation.sm]}>
            <View style={styles.readyHeader}>
              <Ionicons name="checkmark-circle" size={18} color={c.success} />
              <Text style={styles.readyTitle}>PDF ready</Text>
            </View>
            {busy === 'generate' ? (
              <ActivityIndicator color={c.primary} />
            ) : (
              <Text style={styles.ready}>
                {pages ?? 1} {pages === 1 ? 'page' : 'pages'} generated.{'\n'}
                Share it and choose Save to Files to keep a copy - files in the app cache
                are cleared by Android when storage runs low.
              </Text>
            )}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label={format === 'tmc' ? 'Create TMC Form' : 'Create Detailed Log'}
            onPress={generate}
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
            label="Share / Save"
            onPress={() => setSheetOpen(true)}
            variant="secondary"
            disabled={busy !== null}
            fullWidth
            accessibilityHint="Opens the file and the options for sending it"
          />
          <Button
            label="Print"
            onPress={onPrint}
            variant="secondary"
            loading={busy === 'print'}
            disabled={busy !== null && busy !== 'print'}
            fullWidth
          />
        </View>
      </ScrollView>

      {/*
        The system share sheet that `expo-sharing` opens covers the *destinations*.
        What it cannot show is the file itself, and this is the one screen where
        that matters: a student is about to hand these hours to a supervisor for
        sign-off, and should be able to confirm what they are sending first. So
        the sheet is the file row, and the system takes over from there.
      */}
      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Send your record">
        <View style={styles.sheetFile}>
          <View style={styles.sheetIcon}>
            <Ionicons name="document-text" size={20} color={c.primaryOnSoft} />
          </View>
          <View style={styles.sheetText}>
            <Text style={styles.sheetName}>
              {format === 'tmc' && month ? `TMC Daily Time Record — ${monthLabel(month)}` : 'OJT Detailed Log'}
            </Text>
            <Text style={styles.sheetMeta}>
              {uri
                ? `PDF · ${pages ?? 1} ${pages === 1 ? 'page' : 'pages'} · ${formatHours(summary.completed)} hrs logged to date`
                : 'Not generated yet — it will be created when you send'}
            </Text>
          </View>
        </View>

        <View style={styles.sheetActions}>
          <Button
            label="Share / Save to Files"
            onPress={onShare}
            loading={busy === 'share'}
            fullWidth
            accessibilityHint="Opens the system share sheet"
          />
          <Button
            label="Print"
            onPress={onPrint}
            variant="secondary"
            loading={busy === 'print'}
            fullWidth
          />
        </View>

        <Text style={styles.sheetNote}>
          Files in the app cache are cleared by Android when storage runs low. Choose Save to
          Files to keep a copy.
        </Text>
      </BottomSheet>
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

    actions: { gap: spacing.md },

    sheetFile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.primarySoft,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.primaryOutline,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    sheetIcon: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.surface,
    },
    sheetText: { flex: 1, gap: 2 },
    sheetName: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.primaryOnSoft,
    },
    sheetMeta: {
      ...NUMERIC,
      fontSize: fontSize.xs,
      color: c.primaryOnSoft,
      opacity: 0.9,
    },
    sheetActions: { gap: spacing.md },
    sheetNote: {
      fontSize: fontSize.xs,
      color: c.textMuted,
      lineHeight: scaledLine(fontSize.xs, 1.5),
      marginTop: spacing.md,
    },
  });

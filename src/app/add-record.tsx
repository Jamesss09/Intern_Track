import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Button, ControlledField } from '@/components/FormField';
import { ScreenHeader } from '@/components/ScreenHeader';
import { BottomSheet } from '@/components/BottomSheet';
import { CalendarPicker } from '@/components/CalendarPicker';
import { TimePickerField } from '@/components/TimePickerField';
import * as timeRecordService from '@/services/timeRecordService';
import {
  TimeCalculationError,
  computeDayMinutes,
  daySpan,
  minutesToHours,
  SESSION_KEYS,
  type DaySessions,
} from '@/utils/timeCalculator';
import { formatBreak, formatHours } from '@/utils/progressCalculator';
import { formatDateWithWeekday, formatTime12h, todayIso } from '@/utils/dateFormatter';
import {
  DateRestrictionError,
  RESTRICTION_HINT,
  isRecordableDate,
  restrictionMessage,
} from '@/utils/dateRestriction';
import {
  contentWidth,
  fontSize,
  fontWeight,
  radius,
  HIT_SIZE,
  scaledLine,
  spacing,
  NUMERIC,
} from '@/constants/theme';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z
  .object({
    date: z
      .string()
      .min(1, 'Date is required')
      .regex(ISO_DATE, 'Use the format YYYY-MM-DD')
      .refine((v) => !Number.isNaN(Date.parse(v)), 'That is not a real date'),
    am_in: z.string().nullable(),
    am_out: z.string().nullable(),
    pm_in: z.string().nullable(),
    pm_out: z.string().nullable(),
    break: z
      .string()
      .min(1, 'Enter a break length, or 0')
      .refine(
        (v) =>
          /^\d+$/.test(v) ||
          /^\d+\s*(h|hr|hrs|hour|hours)?\s*\d*\s*(m|min|mins|minute|minutes)?$/i.test(v),
        'Use minutes (60) or hours (1h 30)',
      ),
    notes: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    /**
     * Run the real calculator so the error the user sees is the same one the
     * database would reject the row for.
     *
     * The issue is attached to the *session* rather than to a single field,
     * because a half-filled pair is one mistake with two halves: marking only
     * `am_in` as wrong would tell the student their time in is invalid when it
     * is their time out they never entered.
     */
    const hasAM = Boolean(values.am_in || values.am_out);
    const hasPM = Boolean(values.pm_in || values.pm_out);

    if (!hasAM && !hasPM) {
      ctx.addIssue({
        code: 'custom',
        path: ['am_in'],
        message: 'Enter at least one session — AM or PM time in and time out',
      });
      return;
    }

    try {
      const breakMinutes = timeRecordService.parseBreakInput(values.break);
      if (breakMinutes === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['break'],
          message: 'Enter the break in minutes, like 60 or 1h 30',
        });
        return;
      }

      computeDayMinutes(values as DaySessions, breakMinutes);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Check the times';
      const field = message.startsWith('AM') ? 'am_out' : message.startsWith('PM') ? 'pm_out' : 'break';
      ctx.addIssue({ code: 'custom', path: [field], message });
    }
  });

type RecordValues = z.infer<typeof schema>;

export default function AddRecordScreen() {
  const { internship, refreshSummary, clearError } = useApp();
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const params = useLocalSearchParams<{ id?: string }>();
  const recordId = params.id ? Number(params.id) : null;
  const isEdit = Number.isFinite(recordId) && recordId !== null;

  const [saving, setSaving] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  /**
   * The date the edited record already holds, captured on load.
   *
   * It is what the current-day rule compares against: an update may keep its own
   * date but may not move to another, and the stored value is the only place
   * that knows what "its own" was. The service re-reads it before writing, so
   * this feeds the form's own error message, not the guarantee.
   */
  const [existingDate, setExistingDate] = useState<string | null>(null);

  const { control, handleSubmit, setValue, setError, formState } = useForm<RecordValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: todayIso(),
      // A school day by default: an 8-to-5 morning session and a 1-to-5
      // afternoon, with a 1-hour lunch. Every one is replaceable from the
      // pickers, and starting blank would mean a student who only worked a
      // morning has to clear three fields they never meant to fill.
      am_in: '08:00',
      am_out: '12:00',
      pm_in: '13:00',
      pm_out: '17:00',
      break: '60',
      notes: '',
    },
    mode: 'onChange',
  });

  // Load the record being edited. Done in an effect rather than in
  // `defaultValues`, because the `id` param is not reliably populated on the
  // very first render pass.
  useEffect(() => {
    if (!isEdit || recordId === null) return;

    void timeRecordService.getRecordById(recordId).then((record) => {
      if (!record) return;
      setExistingDate(record.date);
      setValue('date', record.date);
      // Null-safe, not `?? record.time_in`: a row written before migration v4
      // has no PM session, and backfilling it from the day's span here would
      // re-invent the afternoon the student deliberately left blank. The AM pair
      // still falls back, because before v4 that is where the only session was.
      setValue('am_in', record.am_time_in ?? record.time_in);
      setValue('am_out', record.am_time_out ?? record.time_out);
      setValue('pm_in', record.pm_time_in);
      setValue('pm_out', record.pm_time_out);
      setValue('break', String(record.break_minutes));
      setValue('notes', record.notes ?? '');
    });
  }, [isEdit, recordId, setValue]);

  /**
   * Re-seeds the date with today every time the form is opened.
   *
   * "Today" is captured when the form mounts, but a student who leaves the app
   * open across midnight — or backgrounds it for the night and comes back in the
   * morning — would otherwise be looking at yesterday and be refused by the
   * service for a reason the screen never showed them.
   *
   * Safe to do unconditionally for a new record, because today is the only
   * selectable day: there is no user choice here to clobber. An edit is left
   * alone, since its date comes from the record.
   *
   * This covers reopening the form, not the screen being left open overnight —
   * the service is what guarantees the rule there, and it will reject the write
   * with a message rather than store the wrong day.
   */
  useFocusEffect(
    useCallback(() => {
      if (isEdit) return;
      setValue('date', todayIso());
    }, [isEdit, setValue]),
  );

  /**
   * Live duration preview, so the effect of the break and of the two sessions is
   * visible before saving. `useWatch` rather than `watch`, because the latter
   * returns a function the React Compiler refuses to memoise.
   */
  const [date, brk, ...times] = useWatch({
    control,
    name: ['date', 'break', ...SESSION_KEYS],
  });

  const sessions: DaySessions = {
    am_in: (times[0] as string | null) ?? null,
    am_out: (times[1] as string | null) ?? null,
    pm_in: (times[2] as string | null) ?? null,
    pm_out: (times[3] as string | null) ?? null,
  };

  /**
   * The date field renders its own error, because it is a `Pressable` and not a
   * `ControlledField` — there is no `Controller` to lift `fieldState.error` from.
   */
  const dateError = formState.errors.date?.message;

  const breakMinutes = timeRecordService.parseBreakInput(brk);

  /**
   * `null` means "these times do not describe a loggable day yet".
   *
   * Deliberately a silent failure: this runs on every keystroke of the break
   * field, and an exception would have to be caught to render. The real message
   * comes from the schema on submit, and from the service if the form is somehow
   * bypassed — the preview only has to stop claiming a number it cannot compute.
   */
  const preview = (() => {
    if (breakMinutes === null) return null;
    try {
      return computeDayMinutes(sessions, breakMinutes);
    } catch {
      return null;
    }
  })();

  /** The day's overall range, or null while the sessions are still incomplete. */
  const span = (() => {
    try {
      return daySpan(sessions);
    } catch {
      return null;
    }
  })();

  /**
   * `time_in`–`time_out` as the student reads it, for under the total.
   *
   * Shown because that pair is still what the Records list and the printed form
   * display as the day's range: a student checking their hours wants to see the
   * same span they will find elsewhere, not four separate cells to add up.
   */
  const spanLabel = (() => {
    if (!span || span.time_in === null || span.time_out === null) return null;
    return `${formatTime12h(span.time_in)} – ${formatTime12h(span.time_out)}`;
  })();

  const onSubmit = handleSubmit(async (values) => {
    if (!internship) return;

    // Belt before braces: the schema only checks the date's *format*, because
    // the recordability rule depends on whether this is an edit. Checking it here
    // puts the message under the field the user actually touched. The service
    // re-checks regardless, and is the one that counts.
    if (!isRecordableDate(values.date, existingDate)) {
      setError('date', { message: restrictionMessage(values.date) });
      return;
    }

    const breakMinutes = timeRecordService.parseBreakInput(values.break);
    if (breakMinutes === null) return;

    setSaving(true);
    clearError();

    try {
      if (isEdit && recordId !== null) {
        await timeRecordService.updateRecord(recordId, {
          date: values.date,
          ...sessions,
          break_minutes: breakMinutes,
          notes: values.notes || null,
        });
      } else {
        await timeRecordService.createRecord({
          internship_id: internship.id,
          date: values.date,
          ...sessions,
          break_minutes: breakMinutes,
          notes: values.notes || null,
        });
      }

      await refreshSummary();
      router.back();
    } catch (error) {
      /**
       * Ordered by how specific the message is. A `DateRestrictionError` is the
       * service saying the day is not allowed and it knows why; falling through
       * to the generic "check for a duplicate day" would replace a real reason
       * with a guess.
       */
      const message =
        error instanceof DateRestrictionError || error instanceof TimeCalculationError
          ? error.message
          : 'That record could not be saved. Check for a duplicate day.';
      Alert.alert('Could not save', message);
    } finally {
      setSaving(false);
    }
  });

  const onDelete = useCallback(() => {
    if (!isEdit || recordId === null) return;
    Alert.alert('Delete this day?', 'This removes the record permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void timeRecordService
            .deleteRecord(recordId)
            .then(refreshSummary)
            .then(() => router.back());
        },
      },
    ]);
  }, [isEdit, recordId, refreshSummary]);

  if (!internship) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Log a Day" onBack={() => router.back()} />
        <View style={styles.container}>
          <Text style={styles.warning}>Set up your OJT details before logging time.</Text>
          <Button label="Close" onPress={() => router.back()} variant="secondary" fullWidth />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* A modal has no back button of its own on Android, so without this the
          only way out is the system gesture. */}
      <ScreenHeader
        title={isEdit ? 'Edit Day' : 'Log a Day'}
        subtitle={isEdit ? undefined : internship.company_name}
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={[styles.preview, preview === null && styles.previewInvalidBox, elevation.sm]}>
          <View style={styles.previewHeader}>
            <Ionicons
              name={preview === null ? 'help-circle-outline' : 'time-outline'}
              size={16}
              color={preview === null ? c.textMuted : c.primaryOnSoft}
            />
            <Text style={styles.previewLabel}>
              {preview === null ? 'Duration' : formatDateWithWeekday(date)}
            </Text>
          </View>

          <Text style={[styles.previewValue, preview === null && styles.previewInvalid]}>
            {preview === null ? '-' : `${formatHours(minutesToHours(preview))} hrs`}
          </Text>

          {spanLabel ? <Text style={styles.previewSpan}>{spanLabel}</Text> : null}

          {preview !== null && breakMinutes !== null ? (
            <Text style={styles.previewHint}>
              {formatBreak(breakMinutes)} deducted
            </Text>
          ) : (
            <Text style={styles.previewHintMuted}>Check the times and break length</Text>
          )}
        </View>

        <View style={styles.form}>
          {/**
           * A Pressable, not a text input.
           *
           * The date used to be a free-text `YYYY-MM-DD` field, which is exactly
           * the thing this feature removes: any keyboard allows yesterday or
           * tomorrow to be typed in. There is no way to express "only today" in a
           * `TextInput`, so the value is now reachable only through the calendar
           * below, and the service refuses anything else regardless.
           */}
          <View style={styles.dateField}>
            <Text style={styles.dateLabel}>Date</Text>

            <Pressable
              onPress={() => setCalendarOpen(true)}
              disabled={isEdit}
              style={({ pressed }) => [
                styles.dateRow,
                isEdit && styles.dateRowLocked,
                pressed && !isEdit && styles.dateRowPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Date, ${formatDateWithWeekday(date)}`}
              accessibilityHint={
                isEdit
                  ? 'This day is already recorded. Times and notes can still be corrected.'
                  : 'Opens a calendar where only today can be selected'
              }
              accessibilityState={{ disabled: isEdit }}
            >
              <Ionicons name="calendar-outline" size={18} color={c.textSubtle} />
              <Text style={[styles.dateValue, isEdit && styles.dateValueLocked]}>
                {formatDateWithWeekday(date)}
              </Text>
              {isEdit ? null : <Ionicons name="chevron-forward" size={18} color={c.textMuted} />}
            </Pressable>

            {dateError ? (
              <Text style={styles.dateError}>{dateError}</Text>
            ) : (
              <Text style={styles.dateHint}>
                {isEdit ? 'The date of a recorded day cannot be changed.' : RESTRICTION_HINT}
              </Text>
            )}
          </View>

          <BottomSheet
            visible={calendarOpen}
            onClose={() => setCalendarOpen(false)}
            title="Choose a date"
          >
            <CalendarPicker
              selected={date}
              onSelect={(iso) => {
                setValue('date', iso, { shouldValidate: true });
                setCalendarOpen(false);
              }}
            />
          </BottomSheet>

          {/**
           * Two blocks of two, not four fields in a line.
           *
           * The TMC form prints AM and PM as separate pairs of cells, so the
           * screen mirrors that: a student reading their own signature back
           * later finds the same grouping here. PM is marked optional because an
           * afternoon-only or morning-only shift is an ordinary day, not a
           * mistake — but the fields stay visible rather than being hidden behind
           * a toggle, since a field a student cannot see is one they will not
           * look for.
           */}
          <View style={styles.sessionBlock}>
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <TimePickerField
                  label="AM Time In"
                  session="AM"
                  value={sessions.am_in}
                  error={formState.errors.am_in?.message}
                  onChange={(value) => setValue('am_in', value, { shouldValidate: true })}
                />
              </View>
              <View style={styles.rowItem}>
                <TimePickerField
                  label="AM Time Out"
                  session="AM"
                  value={sessions.am_out}
                  error={formState.errors.am_out?.message}
                  onChange={(value) => setValue('am_out', value, { shouldValidate: true })}
                />
              </View>
            </View>
          </View>

          <View style={styles.sessionBlock}>
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <TimePickerField
                  label="PM Time In"
                  session="PM"
                  optional
                  value={sessions.pm_in}
                  error={formState.errors.pm_in?.message}
                  onChange={(value) => setValue('pm_in', value, { shouldValidate: true })}
                />
              </View>
              <View style={styles.rowItem}>
                <TimePickerField
                  label="PM Time Out"
                  session="PM"
                  optional
                  value={sessions.pm_out}
                  error={formState.errors.pm_out?.message}
                  onChange={(value) => setValue('pm_out', value, { shouldValidate: true })}
                />
              </View>
            </View>
          </View>

          <ControlledField
            control={control}
            name="break"
            label="Unpaid break"
            autoCapitalize="none"
            placeholder="60"
            hint="In minutes (60) or hours (1h 30). Taken off the day once, not off each session."
          />

          <ControlledField
            control={control}
            name="notes"
            label="Notes (optional)"
            multiline
            numberOfLines={3}
            style={styles.notes}
            placeholder="What did you work on?"
          />

          <Button
            label={isEdit ? 'Save Changes' : 'Log This Day'}
            onPress={onSubmit}
            loading={saving}
            fullWidth
          />
          <Button label="Cancel" onPress={() => router.back()} variant="secondary" fullWidth />
          {isEdit ? (
            <Button label="Delete This Day" onPress={onDelete} variant="danger" fullWidth />
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    form: { gap: spacing.lg },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'center' },
    /**
     * `minWidth` on the items, not a width breakpoint in JS.
     *
     * With `flexWrap` on the row, two items wrap to one line each as soon as
     * `2 * 140` exceeds the space actually available. The available width is
     * the window minus the screen and card padding, so this lands at ~340 dp:
     * a 320 dp phone stacks, a 375 dp phone does not. Deriving it from real
     * layout instead of `useWindowDimensions` means a rotation or an unfolded
     * foldable is handled by the same rule, with nothing to keep in sync.
     *
     * The tempting alternative — `flexDirection: 'column'` — is wrong here:
     * the items are `flex: 1`, which in a column means `flexBasis: 0` on the
     * *vertical* axis, collapsing the row to zero height.
     */
    rowItem: { flex: 1, minWidth: 140 },
    /**
     * Wraps one session's pair of fields so the AM group and the PM group are
     * visually separate blocks rather than a single run of four inputs.
     */
    sessionBlock: { gap: spacing.xs },
    notes: { minHeight: 88, textAlignVertical: 'top' },

    dateField: { gap: spacing.xs },
    dateLabel: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.textMuted,
    },
    /**
     * Shaped like `FormField`'s `inputRow` so the date sits in the same visual
     * rhythm as the fields below it, while being a button. Full width rather
     * than paired with a "Today" shortcut — with one possible value there is
     * nothing for a shortcut to do.
     */
    dateRow: {
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
    dateRowLocked: { backgroundColor: c.surfaceAlt, borderColor: c.border },
    dateRowPressed: { backgroundColor: c.primarySoft, borderColor: c.primaryOutline },
    dateValue: { flex: 1, fontSize: fontSize.md, color: c.text },
    dateValueLocked: { color: c.textMuted },
    dateError: { fontSize: fontSize.xs, color: c.danger, fontWeight: fontWeight.medium },
    /** Matches `FormField`'s hint, including its `textMuted` contrast reasoning. */
    dateHint: { fontSize: fontSize.xs, color: c.textMuted },

    preview: {
      backgroundColor: c.primarySoft,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.primaryOutline,
      padding: spacing.lg,
      gap: spacing.xs,
    },
    previewInvalidBox: {
      backgroundColor: c.surfaceAlt,
      borderColor: c.border,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    previewLabel: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.primaryOnSoft,
    },
    previewValue: {
      ...NUMERIC,
      fontSize: fontSize.display,
      fontWeight: fontWeight.bold,
      color: c.primaryOnSoft,
      lineHeight: scaledLine(fontSize.display, 1.1),
    },
    /**
     * De-emphasises the total when the entered times do not make a valid day.
     * `textMuted`, not `textSubtle`: this sits on `primarySoft`, where
     * `textSubtle` measures 2.96:1 in light mode — under the 3:1 floor for a
     * graphic, let alone the 4.5:1 for text this size.
     */
    previewInvalid: {
      color: c.textMuted,
    },
    previewHint: {
      fontSize: fontSize.xs,
      fontWeight: fontWeight.medium,
      color: c.primaryOnSoft,
      opacity: 0.85,
    },
    /**
     * The day's overall span, printed between the total and the break note so the
     * three read top to bottom as: hours, when, what was deducted.
     */
    previewSpan: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      color: c.primaryOnSoft,
      opacity: 0.85,
      marginBottom: spacing.xxs,
    },
    previewHintMuted: {
      fontSize: fontSize.xs,
      color: c.textMuted,
    },
    warning: {
      fontSize: fontSize.md,
      color: c.textMuted,
    },
  });

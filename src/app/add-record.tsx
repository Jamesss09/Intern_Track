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
import * as timeRecordService from '@/services/timeRecordService';
import { TimeCalculationError, computeTotalMinutes, minutesToHours } from '@/utils/timeCalculator';
import { formatBreak, formatHours } from '@/utils/progressCalculator';
import { formatDateWithWeekday, todayIso } from '@/utils/dateFormatter';
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
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;

const schema = z
  .object({
    date: z
      .string()
      .min(1, 'Date is required')
      .regex(ISO_DATE, 'Use the format YYYY-MM-DD')
      .refine((v) => !Number.isNaN(Date.parse(v)), 'That is not a real date'),
    time_in: z
      .string()
      .min(1, 'Time in is required')
      .refine((v) => HHMM.test(v), 'Use a 24-hour time like 08:00'),
    time_out: z
      .string()
      .min(1, 'Time out is required')
      .refine((v) => HHMM.test(v), 'Use a 24-hour time like 17:00'),
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
    // Run the real calculator so the error the user sees is the same one the
    // database would reject the row for.
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
      computeTotalMinutes(values.time_in, values.time_out, breakMinutes);
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        path: ['break'],
        message: error instanceof Error ? error.message : 'Check the times',
      });
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
      time_in: '08:00',
      time_out: '17:00',
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
      setValue('time_in', record.time_in);
      setValue('time_out', record.time_out);
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

  // Live duration preview, so the effect of the break is visible before saving.
  // `useWatch` rather than `watch`, because the latter returns a function the
  // React Compiler refuses to memoise.
  const [date, timeIn, timeOut, brk] = useWatch({
    control,
    name: ['date', 'time_in', 'time_out', 'break'],
  });

  /**
   * The date field renders its own error, because it is a `Pressable` and not a
   * `ControlledField` — there is no `Controller` to lift `fieldState.error` from.
   */
  const dateError = formState.errors.date?.message;

  const preview = (() => {
    const breakMinutes = timeRecordService.parseBreakInput(brk);
    if (breakMinutes === null) return null;
    try {
      return computeTotalMinutes(timeIn, timeOut, breakMinutes);
    } catch {
      return null;
    }
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
          time_in: values.time_in,
          time_out: values.time_out,
          break_minutes: breakMinutes,
          notes: values.notes || null,
        });
      } else {
        await timeRecordService.createRecord({
          internship_id: internship.id,
          date: values.date,
          time_in: values.time_in,
          time_out: values.time_out,
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

  const breakMinutes = timeRecordService.parseBreakInput(brk);

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

          <View style={styles.row}>
            <View style={styles.rowItem}>
              <ControlledField
                control={control}
                name="time_in"
                label="Time in"
                autoCapitalize="none"
                placeholder="08:00"
              />
            </View>
            <View style={styles.rowItem}>
              <ControlledField
                control={control}
                name="time_out"
                label="Time out"
                autoCapitalize="none"
                placeholder="17:00"
              />
            </View>
          </View>

          <ControlledField
            control={control}
            name="break"
            label="Unpaid break"
            autoCapitalize="none"
            placeholder="60"
            hint="In minutes (60) or hours (1h 30)."
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
    previewHintMuted: {
      fontSize: fontSize.xs,
      color: c.textMuted,
    },
    warning: {
      fontSize: fontSize.md,
      color: c.textMuted,
    },
  });

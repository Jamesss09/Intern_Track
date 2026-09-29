import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Button, ControlledField } from '@/components/FormField';
import { ScreenHeader } from '@/components/ScreenHeader';
import * as timeRecordService from '@/services/timeRecordService';
import { TimeCalculationError, computeTotalMinutes, minutesToHours } from '@/utils/timeCalculator';
import { formatBreak, formatHours } from '@/utils/progressCalculator';
import { formatDateWithWeekday, todayIso } from '@/utils/dateFormatter';
import {
  contentWidth,
  fontSize,
  fontWeight,
  radius,
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

  const { control, handleSubmit, setValue } = useForm<RecordValues>({
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
      setValue('date', record.date);
      setValue('time_in', record.time_in);
      setValue('time_out', record.time_out);
      setValue('break', String(record.break_minutes));
      setValue('notes', record.notes ?? '');
    });
  }, [isEdit, recordId, setValue]);

  // Live duration preview, so the effect of the break is visible before saving.
  // `useWatch` rather than `watch`, because the latter returns a function the
  // React Compiler refuses to memoise.
  const [date, timeIn, timeOut, brk] = useWatch({
    control,
    name: ['date', 'time_in', 'time_out', 'break'],
  });
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
      const message =
        error instanceof TimeCalculationError
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
          <View style={styles.row}>
            <View style={styles.rowItemWide}>
              <ControlledField
                control={control}
                name="date"
                label="Date"
                autoCapitalize="none"
                placeholder="2026-09-28"
              />
            </View>
            <View style={styles.rowItemNarrow}>
              <Button
                label="Today"
                onPress={() => setValue('date', todayIso())}
                variant="secondary"
                fullWidth
                accessibilityHint="Fills the date field with today"
              />
            </View>
          </View>

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
    rowItemWide: { flex: 2, minWidth: 140 },
    rowItemNarrow: { flex: 1, minWidth: 140 },
    notes: { minHeight: 88, textAlignVertical: 'top' },

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

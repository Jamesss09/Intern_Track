import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Button, ControlledField } from '@/components/FormField';
import { ListRow } from '@/components/ListRow';
import { HeaderButton, ScreenHeader } from '@/components/ScreenHeader';
import { formatDateLong, todayIso } from '@/utils/dateFormatter';
import { formatHours } from '@/utils/progressCalculator';
import { contentWidth, fontSize, fontWeight, radius, scaledLine, spacing } from '@/constants/theme';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z
  .object({
    company_name: z.string().min(2, 'Enter the company name'),
    position: z.string().min(2, 'Enter your position'),
    required_hours: z
      .string()
      .min(1, 'Required hours is required')
      .refine((v) => Number(v) > 0, 'Required hours must be greater than zero'),
    start_date: z
      .string()
      .min(1, 'Start date is required')
      .regex(ISO_DATE, 'Use the format YYYY-MM-DD'),
    end_date: z
      .string()
      .regex(ISO_DATE, 'Use the format YYYY-MM-DD')
      .optional()
      .or(z.literal('')),
  })
  // Lexicographic, and correct for `YYYY-MM-DD`: a later date is a larger string.
  .refine((values) => !values.end_date || values.end_date >= values.start_date, {
    path: ['end_date'],
    message: 'The end date cannot be before the start date',
  });

type SetupValues = z.infer<typeof schema>;

/** 486 is the figure most programmes in this cohort use; still editable. */
const DEFAULT_REQUIRED_HOURS = '486';

export default function InternshipSetupScreen() {
  const { user, internship, saveInternship, updateInternship, busy, error, clearError } = useApp();
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  /**
   * Only meaningful when a placement already exists. A first-time setup has
   * nothing to switch out of, so it renders the form straight away.
   */
  const [editing, setEditing] = useState(false);

  const { control, handleSubmit, reset } = useForm<SetupValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      company_name: internship?.company_name ?? '',
      position: internship?.position ?? '',
      required_hours: internship ? String(internship.required_hours) : DEFAULT_REQUIRED_HOURS,
      start_date: internship?.start_date ?? todayIso(),
      end_date: internship?.end_date ?? '',
    },
  });

  /**
   * Re-seeds the form from the stored placement every time the screen regains
   * focus, unless an edit is in progress.
   *
   * `defaultValues` is read once, on mount, so without this a cancelled edit
   * would leave the next visit showing the abandoned draft rather than what is
   * actually saved. Guarded on `editing` so it cannot stomp on typing.
   */
  useFocusEffect(
    useCallback(() => {
      if (editing) return;

      reset({
        company_name: internship?.company_name ?? '',
        position: internship?.position ?? '',
        required_hours: internship ? String(internship.required_hours) : DEFAULT_REQUIRED_HOURS,
        start_date: internship?.start_date ?? todayIso(),
        end_date: internship?.end_date ?? '',
      });
    }, [editing, internship, reset]),
  );

  const onSubmit = handleSubmit(async (values) => {
    clearError();

    const fields = {
      company_name: values.company_name,
      position: values.position,
      required_hours: Number(values.required_hours),
      start_date: values.start_date,
      end_date: values.end_date || null,
    };

    try {
      if (editing && internship) {
        // Updates the existing row. Routing this through `saveInternship` would
        // archive the placement and create a new one, taking the link to every
        // logged day's `internship_id` with it.
        await updateInternship(internship.id, fields);
      } else {
        await saveInternship({ user_id: user?.id ?? 0, ...fields });
      }

      setEditing(false);
      router.back();
    } catch {
      // Already surfaced through `error` in context.
    }
  });

  const onLeaveEdit = useCallback(() => {
    setEditing(false);
    clearError();
  }, [clearError]);

  const showForm = !internship || editing;

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title="OJT Details"
        subtitle={showForm ? undefined : internship?.company_name}        onBack={() => router.back()}
        action={
          internship ? (
            editing ? (
              <HeaderButton label="Done" icon="checkmark" onPress={onLeaveEdit} />
            ) : (
              <HeaderButton label="Edit" icon="create-outline" onPress={() => setEditing(true)} />
            )
          ) : undefined
        }
      />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <View style={styles.alert} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle" size={16} color={c.danger} />
            <Text style={styles.alertText}>{error}</Text>
          </View>
        ) : null}

        {/*
          Written out rather than reusing `showForm`, so TypeScript narrows
          `internship` to non-null in the view branch below.
        */}
        {!internship || editing ? (
          <>
            {/*
              Replaces the old "Saving archives your previous placement" warning,
              which was true of the old code path and is now false. The opposite
              is worth saying plainly, because it is the reason a student should
              feel safe fixing a typo here.
            */}
            {editing ? (
              <View style={styles.notice}>
                <View style={styles.noticeHeader}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={c.primaryOnSoft} />
                  <Text style={styles.noticeTitle}>Your logged days are kept</Text>
                </View>
                <Text style={styles.noticeText}>
                  Editing changes these details only. Every day you have already logged stays linked
                  to this placement.
                </Text>
              </View>
            ) : null}

            <View style={[styles.panel, elevation.sm]}>
              <Text style={styles.panelTitle}>Placement</Text>

              <ControlledField
                control={control}
                name="company_name"
                label="Company"
                onEdit={clearError}
                icon="business-outline"
                autoCapitalize="words"
                placeholder="BDMPC"
              />

              <ControlledField
                control={control}
                name="position"
                label="Position"
                onEdit={clearError}
                icon="briefcase-outline"
                autoCapitalize="words"
                placeholder="IT Intern"
              />

              <ControlledField
                control={control}
                name="required_hours"
                label="Required hours"
                onEdit={clearError}
                icon="time-outline"
                keyboardType="numeric"
                hint="The total your school requires you to complete."
              />
            </View>

            <View style={[styles.panel, elevation.sm]}>
              <Text style={styles.panelTitle}>Dates</Text>

              <ControlledField
                control={control}
                name="start_date"
                label="Start date"
                onEdit={clearError}
                icon="calendar-outline"
                autoCapitalize="none"
                placeholder="2026-06-01"
                hint="YYYY-MM-DD"
              />

              <ControlledField
                control={control}
                name="end_date"
                label="End date (optional)"
                onEdit={clearError}
                icon="flag-outline"
                autoCapitalize="none"
                placeholder="2026-09-30"
                hint="Leave blank while the placement is ongoing. YYYY-MM-DD"
              />
            </View>

            <View style={styles.actions}>
              <Button label="Save" onPress={onSubmit} loading={busy} fullWidth />
              <Button
                label="Cancel"
                onPress={editing ? onLeaveEdit : () => router.back()}
                variant="secondary"
                fullWidth
              />
            </View>
          </>
        ) : (
          <>
            <View style={[styles.panel, elevation.sm]}>
              <Text style={styles.panelTitle}>Placement</Text>
              <ListRow icon="business-outline" label="Company" value={internship.company_name} />
              <ListRow icon="briefcase-outline" label="Position" value={internship.position} />
              <ListRow
                icon="time-outline"
                label="Required hours"
                value={`${formatHours(internship.required_hours)} hours`}
              />
            </View>

            <View style={[styles.panel, elevation.sm]}>
              <Text style={styles.panelTitle}>Dates</Text>
              <ListRow
                icon="calendar-outline"
                label="Start date"
                value={formatDateLong(internship.start_date)}
              />
              <ListRow
                icon="flag-outline"
                label="End date"
                value={internship.end_date ? formatDateLong(internship.end_date) : 'Ongoing'}
              />
            </View>

            <View style={styles.notice}>
              <View style={styles.noticeHeader}>
                <Ionicons name="information-circle-outline" size={16} color={c.primaryOnSoft} />
                <Text style={styles.noticeTitle}>Editing is safe</Text>
              </View>
              <Text style={styles.noticeText}>
                Changing any of these updates the details in place. Your logged days stay linked to
                this placement.
              </Text>
            </View>
          </>
        )}
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
    panel: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: spacing.lg,
      gap: spacing.lg,
    },
    panelTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },

    notice: {
      backgroundColor: c.primarySoft,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.primaryOutline,
      padding: spacing.md,
      gap: spacing.xs,
    },
    noticeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    noticeTitle: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: c.primaryOnSoft,
    },
    noticeText: {
      fontSize: fontSize.sm,
      color: c.primaryOnSoft,
      lineHeight: scaledLine(fontSize.sm, 1.5),
      opacity: 0.9,
    },

    alert: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.dangerSoft,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.danger,
      padding: spacing.md,
    },
    alertText: {
      flex: 1,
      color: c.danger,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
    },

    actions: { gap: spacing.md },
  });

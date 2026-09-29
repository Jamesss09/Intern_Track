import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/FormField';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { ProgressBar } from '@/components/ProgressBar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { StatCard } from '@/components/StatCard';
import * as timeRecordService from '@/services/timeRecordService';
import type { DailyTotal } from '@/services/timeRecordService';
import { formatHours } from '@/utils/progressCalculator';
import { formatDateWithWeekday, shiftIso, todayIso } from '@/utils/dateFormatter';
import { contentWidth, fontSize, fontWeight, radius, scaledLine, spacing, NUMERIC } from '@/constants/theme';

/** Longest run of consecutive logged days ending at today or yesterday. */
const currentStreak = (days: DailyTotal[]): number => {
  if (days.length === 0) return 0;

  const today = todayIso();
  const newest = days[0].date;

  // Yesterday still counts: a streak is not broken at midnight, it is broken
  // once a whole day has been missed.
  if (newest !== today && newest !== shiftIso(today, -1)) return 0;

  // `getDailyTotals` is newest-first, so the run is contiguous from index 0.
  let streak = 1;
  for (let i = 1; i < days.length; i += 1) {
    if (shiftIso(days[i - 1].date, -1) === days[i].date) streak += 1;
    else break;
  }

  return streak;
};

export default function ProgressScreen() {
  const { internship, summary, refreshSummary } = useApp();
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [daily, setDaily] = useState<DailyTotal[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!internship) return;
    setDaily(await timeRecordService.getDailyTotals(internship.id));
  }, [internship]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await refreshSummary();
        await load();
      })();
    }, [refreshSummary, load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSummary();
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [refreshSummary, load]);

  if (!internship || !summary) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Progress" />
        <View style={styles.container}>
          <EmptyState
            title="Nothing to measure yet"
            message="Set up your OJT and log some days to see your progress."
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

  /**
   * Average over days actually logged, not calendar days elapsed. Dividing by
   * elapsed days is the kind of number that makes a student feel behind when
   * they are exactly on schedule.
   */
  const average = daily.length ? summary.completed / daily.length : 0;
  const best = daily.reduce((max, day) => Math.max(max, day.total_hours), 0);
  const streak = currentStreak(daily);

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Progress" subtitle={internship.company_name} />

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
        }
      >
        {/*
          Deliberately compact. The Dashboard already carries the headline figure
          in a hero card, and repeating that at full size here would give the app
          two competing "your progress" screens. This one answers *how*, not
          *how much*.
        */}
        <View style={[styles.card, elevation.sm]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Hours completed</Text>
            <Text style={[styles.percentPill, summary.isComplete && styles.percentPillDone]}>
              {summary.percent.toFixed(0)}%
            </Text>
          </View>

          <ProgressBar progress={summary.percent} height={12} showLabel={false} />

          <Text style={styles.ledger}>
            <Text style={styles.ledgerStrong}>{formatHours(summary.completed)}</Text>
            {` of ${formatHours(summary.required)} hrs · ${formatHours(summary.remaining)} to go`}
          </Text>
        </View>

        {summary.isComplete ? (
          <View style={[styles.complete, elevation.sm]}>
            <View style={styles.completeHeader}>
              <Ionicons name="ribbon-outline" size={20} color={c.success} />
              <Text style={styles.completeTitle}>Requirement met</Text>
            </View>
            <Text style={styles.completeText}>
              You have completed your required OJT hours. Your supervisor can sign the printed
              record.
            </Text>
            <Link href="/print-records" asChild>
              <Button
                label="Print / Save Record"
                onPress={() => {}}
                fullWidth
                accessibilityHint="Generates the official OJT record for your supervisor"
              />
            </Link>
          </View>
        ) : null}

        <View style={styles.grid}>
          <StatCard label="Days logged" value={String(summary.dayCount)} />
          <StatCard
            label="Average per day"
            value={formatHours(average)}
            hint={daily.length ? 'Across days logged' : undefined}
          />
          <StatCard
            label="Current streak"
            value={streak === 1 ? '1 day' : `${streak} days`}
            hint={streak > 0 ? 'Consecutive days logged' : 'Log today to start one'}
          />
          <StatCard
            label="Best day"
            value={daily.length ? formatHours(best) : '—'}
            hint={daily.length ? 'Your longest single day' : undefined}
          />
        </View>

        {/*
          The mockup's donut ring and Week 1–8 stacked bars, in the slot they
          belong in. Not built, on purpose: a chart needs `react-native-svg`,
          which is native code and does not ship in Expo Go — adding it would
          break the one constraint this redesign has to hold. The card is kept
          as a visible placeholder so the omission reads as deliberate rather
          than unfinished, and so the chart has somewhere obvious to land.
        */}
        <View style={[styles.card, elevation.sm]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Weekly breakdown</Text>
          </View>
          <Text style={styles.placeholder}>
            A per-week chart of completed versus remaining hours. It needs a native charting
            module, so it is held back until the app can ship a development build.
          </Text>
        </View>

        <View style={[styles.card, styles.goalCard, elevation.sm]}>
          <ListRow
            icon="flag-outline"
            label="Goal"
            value={`${formatHours(summary.required)} hours`}
          />
        </View>

        <View style={[styles.card, elevation.sm]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Recent days</Text>
            {daily.length > 10 ? (
              <Text style={styles.cardMeta}>Showing 10 of {daily.length}</Text>
            ) : null}
          </View>

          {daily.length === 0 ? (
            <Text style={styles.empty}>No days logged yet.</Text>
          ) : (
            daily.slice(0, 10).map((day, i) => (
              <View
                key={day.date}
                style={[styles.row, i > 0 && styles.rowDivided]}
                accessibilityLabel={`${formatDateWithWeekday(day.date)}, ${formatHours(day.total_hours)} hours`}
              >
                <Text style={styles.rowDate}>{formatDateWithWeekday(day.date)}</Text>
                <Text style={styles.rowHours}>{formatHours(day.total_hours)}</Text>
              </View>
            ))
          )}
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
      gap: spacing.md,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    cardTitle: {
      flex: 1,
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },
    cardMeta: {
      ...NUMERIC,
      fontSize: fontSize.xs,
      // `textMuted`, not `textSubtle` — see the `textSubtle` note in UI-3.
      color: c.textMuted,
    },

    percentPill: {
      ...NUMERIC,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: c.primaryOnSoft,
      backgroundColor: c.primarySoft,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
    percentPillDone: {
      color: c.success,
      backgroundColor: c.successSoft,
    },

    ledger: {
      fontSize: fontSize.md,
      color: c.textMuted,
      lineHeight: scaledLine(fontSize.md, 1.4),
    },
    ledgerStrong: {
      ...NUMERIC,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.accent,
    },

    complete: {
      backgroundColor: c.successSoft,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.success,
      padding: spacing.lg,
      gap: spacing.md,
    },
    completeHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    completeTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.bold,
      color: c.success,
    },
    completeText: {
      fontSize: fontSize.md,
      color: c.text,
      lineHeight: scaledLine(fontSize.md, 1.5),
    },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },

    placeholder: {
      fontSize: fontSize.sm,
      color: c.textMuted,
      lineHeight: scaledLine(fontSize.sm, 1.45),
    },

    goalCard: { paddingVertical: spacing.xs },

    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      gap: spacing.md,
    },
    rowDivided: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    rowDate: {
      flex: 1,
      fontSize: fontSize.sm,
      color: c.text,
    },
    rowHours: {
      ...NUMERIC,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.bold,
      color: c.primary,
    },
    empty: {
      fontSize: fontSize.sm,
      color: c.textMuted,
    },
  });

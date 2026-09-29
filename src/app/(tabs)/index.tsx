import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/FormField';
import { ActionTile } from '@/components/ActionTile';
import { Avatar } from '@/components/Avatar';
import { resolveAvatarUri } from '@/services/avatarService';
import { EmptyState } from '@/components/EmptyState';
import { ListRow } from '@/components/ListRow';
import { ProgressBar } from '@/components/ProgressBar';
import * as timeRecordService from '@/services/timeRecordService';
import type { DailyTotal } from '@/services/timeRecordService';
import { formatHours } from '@/utils/progressCalculator';
import { formatShortDate, formatTimeRange, todayIso } from '@/utils/dateFormatter';
import { firstNameOf } from '@/utils/nameFormatter';
import {
  contentWidth,
  fontSize,
  fontWeight,
  radius,
  scaledLine,
  spacing,
  NUMERIC,
} from '@/constants/theme';
import type { TimeRecord } from '@/types';

/** How many entries "Recent Activity" shows before deferring to the Records tab. */
const RECENT_LIMIT = 4;

export default function DashboardScreen() {
  const { user, internship, summary, refreshSummary } = useApp();
  // `user` is non-null for the whole of this screen: `(tabs)/_layout.tsx`
  // redirects to login for anything that is not authenticated, so every `?? ''`
  // below is a type-narrowing fallback rather than a state this screen renders.
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [today, setToday] = useState<DailyTotal | null>(null);
  const [recent, setRecent] = useState<TimeRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * `listByInternship` is already `ORDER BY date DESC, time_in DESC`, so the
   * newest entries are first and slicing is enough — no second query, and no
   * chance of the list and the summary disagreeing about which day is latest.
   */
  const load = useCallback(async () => {
    if (!internship) return;
    const [days, records] = await Promise.all([
      timeRecordService.getDailyTotals(internship.id),
      timeRecordService.listByInternship(internship.id),
    ]);
    setToday(days.find((d) => d.date === todayIso()) ?? null);
    setRecent(records.slice(0, RECENT_LIMIT));
  }, [internship]);

  // `useFocusEffect` rather than `useEffect`, so returning to this tab after
  // logging a day on the modal screen shows the new entry without a pull to
  // refresh.
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

  /**
   * First name only, for the greeting.
   *
   * The full name is on the line directly below, so greeting with all of it
   * repeats what the user can already read — and at display size it wraps to two
   * lines on a 320 dp screen. The `?? ''` keeps the greeting to one line if the
   * name is empty, rather than rendering "Hi there, !".
   */
  const firstName = firstNameOf(user?.full_name ?? '');

  /**
   * The mockup's hero third line is a course and year. Both are optional on the
   * user record, so this falls back to the placement, which always exists.
   */
  const identity = [user?.course, user?.year_level].filter(Boolean).join(' · ');

  /**
   * The old header put the company in the title bar, and this hero replaced it.
   * Dropping the placement entirely would lose information the Dashboard has
   * always shown, so it gets its own line rather than being folded into the
   * course — a student can have a course but no placement text worth showing.
   */
  const placement = internship
    ? [internship.position, `at ${internship.company_name}`].filter(Boolean).join(' ')
    : '';

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
      }
    >
      {/*
        Not `ScreenHeader`. A hero is a different shape from the standard band —
        a greeting at display size, the full name and placement under it, and an
        avatar — and the progress card below has to tuck *under* this one, which
        a fixed-height header component has no way to allow.
      */}
      <View style={styles.hero}>
        <View style={styles.heroInner}>
          <View style={styles.heroText}>
            <Text style={styles.greeting} numberOfLines={1}>
              {`Hi there, ${firstName}! 👋`}
            </Text>
            <Text style={styles.name} numberOfLines={1}>
              {user?.full_name ?? 'there'}
            </Text>
            <Text style={styles.overview}>Here&apos;s an overview of your OJT progress.</Text>
            {identity ? (
              <Text style={styles.identity} numberOfLines={1}>
                {identity}
              </Text>
            ) : null}
            {placement ? (
              <Text style={styles.placement} numberOfLines={1}>
                {placement}
              </Text>
            ) : null}
          </View>

          {/*
            Read-only here. The Dashboard is not the place to change a profile
            picture, and a second picker entry point on the first screen the
            student sees is a claim the app cannot back up. It only has to *show*
            the one the student set on Profile.
          */}
          <Avatar
            name={user?.full_name ?? ''}
            size={56}
            uri={resolveAvatarUri(user?.avatar_path)}
            onDark
          />
        </View>
      </View>

      {/*
        One wrapper for everything below the band, so the cap and the inset are
        declared once instead of on each of the three siblings. `contentWidth`
        and a horizontal `margin` cannot coexist — `width: '100%'` plus margins
        overflows the parent — which is why the inset is padding here.
      */}
      <View style={styles.section}>
      {!internship || !summary ? (
        <View style={styles.body}>
          <EmptyState
            title="Set up your OJT first"
            message="Add your company, position and required hours, then start logging days."
            action={
              <Link href="/internship-setup" asChild>
                <Button label="Add OJT Details" onPress={() => {}} />
              </Link>
            }
          />
        </View>
      ) : (
        <>
          {/*
            The negative top margin is what makes this card straddle the band's
            edge. It is why the container below sets no `gap` — a `gap` would be
            added on top of the negative margin and drag the card back down by
            one step. Children own their own spacing instead.
          */}
          <View style={[styles.card, styles.progressCard, elevation.md]}>
            <View style={styles.progressHeader}>
              <Text style={styles.cardTitle}>Your OJT Progress</Text>
              <Text style={styles.percent}>{summary.percent.toFixed(0)}%</Text>
            </View>

            <ProgressBar progress={summary.percent} height={10} showLabel={false} />

            <View style={styles.figures}>
              <Figure
                value={formatHours(summary.completed)}
                caption="Completed"
                tone="accent"
                lead
              />
              <Figure value={formatHours(summary.remaining)} caption="Remaining" />
              <Figure value={formatHours(summary.required)} caption="Required" />
            </View>
          </View>

          <View style={styles.grid}>
            <View style={styles.gridRow}>
              <Link href="/add-record" asChild>
                <ActionTile
                  icon="add-circle-outline"
                  title="Track Hours"
                  subtitle="Log a worked day"
                  onPress={() => {}}
                />
              </Link>
              <Link href="/records" asChild>
                <ActionTile
                  icon="document-text-outline"
                  title="View Records"
                  subtitle="Browse your entries"
                  onPress={() => {}}
                />
              </Link>
            </View>

            <View style={styles.gridRow}>
              <Link href="/(tabs)/progress" asChild>
                <ActionTile
                  icon="stats-chart-outline"
                  title="Progress"
                  subtitle="Hours and breakdown"
                  onPress={() => {}}
                />
              </Link>
              <Link href="/print-records" asChild>
                <ActionTile
                  icon="print-outline"
                  title="Print Records"
                  subtitle="PDF of your hours"
                  onPress={() => {}}
                  tone="success"
                />
              </Link>
            </View>
          </View>

          <View style={[styles.card, elevation.sm]}>
            <View style={styles.activityHeader}>
              <Text style={styles.cardTitle}>Recent Activity</Text>
              {today ? (
                <Text style={styles.todayPill}>{formatHours(today.total_hours)}h today</Text>
              ) : null}
            </View>

            {recent.length === 0 ? (
              <Text style={styles.activityEmpty}>
                Nothing logged yet. Tap Track Hours to record your first day.
              </Text>
            ) : (
              recent.map((record, index) => (
                <View key={record.id}>
                  {index > 0 ? <View style={styles.hairline} /> : null}
                  {/*
                    Read-only on purpose. `ListRow` only draws a chevron when a
                    row is tappable, and these open onto the full Records list
                    rather than anything about *this* entry — so they do not
                    claim to be buttons.
                  */}
                  <ListRow
                    icon="time-outline"
                    label={`${formatShortDate(record.date)} · ${formatTimeRange(
                      record.time_in,
                      record.time_out,
                    )}`}
                    value={`${formatHours(record.total_hours)}h`}
                  />
                </View>
              ))
            )}
          </View>
        </>
      )}
      </View>
    </ScrollView>
  );
}

/** One of the three hour figures under the progress bar. */
function Figure({
  value,
  caption,
  tone = 'default',
  lead = false,
}: {
  value: string;
  caption: string;
  tone?: 'default' | 'accent';
  /** The completed figure is the one the screen exists to show. */
  lead?: boolean;
}) {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <View style={styles.figure}>
      <View style={styles.figureValueRow}>
        <Text style={[styles.figureValue, lead && styles.figureValueLead, tone === 'accent' && styles.figureValueAccent]}>
          {value}
        </Text>
        <Text style={styles.figureUnit}>h</Text>
      </View>
      <Text style={styles.figureCaption} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    /**
     * No `gap` and no horizontal padding: the hero is full-bleed and the cards
     * are inset by `section` below.
     *
     * Deliberately not width-capped. The navy has to stay a band edge to edge
     * or it stops reading as one, and it would no longer line up with the
     * `ScreenHeader` band above it. `heroInner` centres the column *inside*
     * the band; `section` caps everything under it to the same column.
     */
    container: { paddingBottom: spacing.xxxl },
    /** The width cap for the whole screen: one declaration, three children. */
    section: { ...contentWidth, paddingHorizontal: spacing.lg },
    body: { paddingVertical: spacing.lg },

    hero: {
      backgroundColor: c.brandDark,
      paddingTop: spacing.lg,
      // Deep enough to read as a band on its own, and to leave the sliver of
      // navy that shows below the overlapping card.
      paddingBottom: spacing.xxxl,
    },
    heroInner: {
      ...contentWidth,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    heroText: { flex: 1, gap: 2 },
    /**
     * The display line, and the one that carries the user's name now.
     *
     * It was `sm` when it read only "Hello," with the name beside it at display
     * size; the name moved into this line, so the weight moved with it. Sizing
     * matters more than usual here — this is the only place the app greets the
     * user by name, and it is the first thing on the first screen.
     *
     * `numberOfLines={1}` on the element. A long name at display size will
     * truncate with an ellipsis, which is better than wrapping into a third hero
     * line and pushing the progress card down the screen.
     */
    greeting: {
      fontSize: fontSize.display,
      fontWeight: fontWeight.bold,
      color: c.onBrand,
      lineHeight: scaledLine(fontSize.display, 1.1),
    },
    /**
     * The full name, demoted from display size.
     *
     * It is still here rather than dropped: it is what the school expects on the
     * printed record, and the greeting truncates a long name. Same token as
     * `identity` — both are the secondary "who are you" lines.
     */
    name: {
      fontSize: fontSize.sm,
      color: c.onBrand,
      opacity: 0.75,
    },
    /**
     * `onBrand` at 0.75, matching every other secondary line on the band. That
     * is the floor for legible text on `brandDark` — going dimmer drops under
     * 4.5:1 — so it is stated once here rather than dimmed further to
     * distinguish it from `name`.
     */
    overview: {
      fontSize: fontSize.xs,
      color: c.onBrand,
      opacity: 0.75,
    },
    identity: {
      fontSize: fontSize.sm,
      color: c.onBrand,
      opacity: 0.75,
    },
    /**
     * Dimmer than `identity` so the two lines still read as a hierarchy, but
     * `onBrand` at 0.75 is the floor for legible text on the band — going lower
     * would drop under 4.5:1, so the step is made with size and weight instead.
     */
    placement: {
      fontSize: fontSize.xs,
      color: c.onBrand,
      opacity: 0.75,
    },

    card: {
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      padding: spacing.lg,
    },
    /** The straddle. 28 px of a 40 px band, leaving 12 px of navy beneath. */
    progressCard: {
      marginTop: -spacing.xxl,
      marginBottom: spacing.lg,
      gap: spacing.md,
      borderRadius: radius.xl,
      padding: spacing.xl,
    },
    progressHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    cardTitle: {
      flex: 1,
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },
    percent: {
      ...NUMERIC,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.primary,
    },

    figures: {
      flexDirection: 'row',
      gap: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      paddingTop: spacing.md,
    },
    figure: { flex: 1, gap: 2 },
    figureValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
    figureValue: {
      ...NUMERIC,
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    figureValueLead: { fontSize: fontSize.xl },
    /** The mockup's orange "291h Completed" figure. */
    figureValueAccent: { color: c.accent },
    /**
     * `textMuted`, not `textSubtle`: the unit is 11 px text, and `textSubtle`
     * measures 3.53:1 on `surface` in light mode and 4.22:1 in dark — under the
     * 4.5:1 floor for normal text in both. `textMuted` gives 6.8:1 / 7.3:1.
     */
    figureUnit: { ...NUMERIC, fontSize: fontSize.xs, color: c.textMuted },
    figureCaption: {
      fontSize: fontSize.xs,
      color: c.textMuted,
    },

    // No horizontal margins here: `section` already supplies the inset, and
    // stacking both would double it.
    grid: { gap: spacing.md, marginBottom: spacing.lg },
    gridRow: { flexDirection: 'row', gap: spacing.md },

    activityHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    todayPill: {
      ...NUMERIC,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.semibold,
      color: c.success,
      backgroundColor: c.successSoft,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      overflow: 'hidden',
    },
    hairline: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
    },
    activityEmpty: {
      fontSize: fontSize.sm,
      color: c.textMuted,
      lineHeight: scaledLine(fontSize.sm, 1.45),
      paddingVertical: spacing.sm,
    },
  });

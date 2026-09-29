import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Link, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { BottomSheet } from '@/components/BottomSheet';
import { Button, FormField } from '@/components/FormField';
import { EmptyState } from '@/components/EmptyState';
import { HeaderAction, ScreenHeader } from '@/components/ScreenHeader';
import { TimeRecordCard } from '@/components/TimeRecordCard';
import * as timeRecordService from '@/services/timeRecordService';
import type { TimeRecord } from '@/types';
import { shiftIso, startOfMonthIso, startOfYearIso, todayIso } from '@/utils/dateFormatter';
import {
  contentWidth,
  fontSize,
  fontWeight,
  radius,
  scaledLine,
  spacing,
  HIT_SIZE,
} from '@/constants/theme';

/**
 * Preset ranges rather than a custom from/to picker.
 *
 * A custom range needs a date-picker, and `@react-native-community/datetimepicker`
 * is native code — adding it would take the app out of Expo Go, which is the one
 * constraint this whole redesign has to respect. Presets cover the question a
 * student actually asks of a records list ("show me this week") and cost
 * nothing. → [[Open Questions|Q8]]
 */
type RangeKey = 'all' | '7d' | '30d' | 'month' | 'year';

const RANGES: readonly { key: RangeKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
];

interface RecordFilter {
  range: RangeKey;
  search: string;
}

const EMPTY_FILTER: RecordFilter = { range: 'all', search: '' };

/** Inclusive ISO bounds for a preset. `-6` keeps "last 7 days" at 7 days wide. */
const boundsFor = (range: RangeKey): { from: string | null; to: string | null } => {
  const today = todayIso();

  switch (range) {
    case '7d':
      return { from: shiftIso(today, -6), to: today };
    case '30d':
      return { from: shiftIso(today, -29), to: today };
    case 'month':
      return { from: startOfMonthIso(today), to: today };
    case 'year':
      return { from: startOfYearIso(today), to: today };
    default:
      return { from: null, to: null };
  }
};

export default function RecordsScreen() {
  const { internship } = useApp();
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * `applied` drives the query; `draft` is what the sheet is currently showing.
   * Splitting them means a half-finished filter — a range picked but Apply not
   * yet pressed — never silently re-runs the listing, and Cancel is free.
   */
  const [applied, setApplied] = useState<RecordFilter>(EMPTY_FILTER);
  const [draft, setDraft] = useState<RecordFilter>(EMPTY_FILTER);
  const [sheetOpen, setSheetOpen] = useState(false);

  const isFiltered = applied.range !== 'all' || applied.search.trim() !== '';

  const load = useCallback(async () => {
    if (!internship) return;
    const { from, to } = boundsFor(applied.range);

    setRecords(
      await timeRecordService.listFiltered(internship.id, {
        from,
        to,
        // An all-whitespace search is the same as no search, and would otherwise
        // match every row that has a note.
        search: applied.search.trim() || null,
      }),
    );
  }, [internship, applied]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const onEdit = useCallback((record: TimeRecord) => {
    router.push({ pathname: '/add-record', params: { id: String(record.id) } });
  }, []);

  const openSheet = useCallback(() => {
    setDraft(applied);
    setSheetOpen(true);
  }, [applied]);

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const applyFilter = useCallback(() => {
    setApplied(draft);
    setSheetOpen(false);
  }, [draft]);

  const resetFilter = useCallback(() => {
    setDraft(EMPTY_FILTER);
    setApplied(EMPTY_FILTER);
    setSheetOpen(false);
  }, []);

  if (!internship) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="OJT Records" />
        {/* Not a `FlatList` with empty data: there is no list to virtualise yet,
            and a `renderItem` that can never run is worse than a `View`. */}
        <View style={styles.list}>
          <EmptyState
            title="No OJT set up"
            message="Add your placement details before logging time."
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
      <ScreenHeader
        title="OJT Records"
        subtitle={internship.company_name}
        action={
          <HeaderAction
            icon="funnel-outline"
            onPress={openSheet}
            label="Filter"
            active={isFiltered}
          />
        }
      />

      <FlatList
        data={records}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
        }
        renderItem={({ item }) => (
          <TimeRecordCard record={item} onPress={onEdit} placement={internship} />
        )}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.count}>
              {isFiltered
                ? `${records.length} matching ${records.length === 1 ? 'day' : 'days'}`
                : `${records.length} ${records.length === 1 ? 'day' : 'days'} logged`}
            </Text>
            <Link href="/add-record" asChild>
              <Button
                label="Log a Day"
                onPress={() => {}}
                fullWidth
                accessibilityHint="Opens a form to record a day's hours"
              />
            </Link>
          </View>
        }
        ListEmptyComponent={
          isFiltered ? (
            <View style={styles.filteredEmpty}>
              <Text style={styles.filteredEmptyTitle}>Nothing matches this filter</Text>
              <Text style={styles.filteredEmptyText}>
                Try a wider date range, or clear the note search.
              </Text>
              <Button label="Clear Filter" onPress={resetFilter} variant="secondary" />
            </View>
          ) : (
            <EmptyState
              title="No records yet"
              message="Log your first day to start tracking your OJT hours."
              action={
                <Link href="/add-record" asChild>
                  <Button label="Log a Day" onPress={() => {}} />
                </Link>
              }
            />
          )
        }
      />

      <BottomSheet visible={sheetOpen} onClose={closeSheet} title="Filter records">
        <View style={styles.filterSection}>
          <Text style={styles.filterLabel}>Date range</Text>

          {RANGES.map((option) => {
            const selected = draft.range === option.key;

            return (
              <Pressable
                key={option.key}
                onPress={() => setDraft((prev) => ({ ...prev, range: option.key }))}
                style={({ pressed }) => [styles.rangeRow, pressed && styles.pressed]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.label}
              >
                <Text style={[styles.rangeLabel, selected && styles.rangeLabelSelected]}>
                  {option.label}
                </Text>

                {selected ? (
                  <Ionicons name="checkmark-circle" size={22} color={c.primary} />
                ) : (
                  // `textSubtle`, not `borderStrong`: an unchecked radio is the
                  // only cue that this row is a choice at all, and `borderStrong`
                  // measures about 1.6:1 on `surface` — under the 3:1 floor for
                  // a meaningful graphic. `textSubtle` gives 3.5:1.
                  <Ionicons name="ellipse-outline" size={22} color={c.textSubtle} />
                )}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.filterSection}>
          <FormField
            label="Search notes"
            icon="search-outline"
            value={draft.search}
            onChangeText={(search) => setDraft((prev) => ({ ...prev, search }))}
            placeholder="e.g. front desk"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={applyFilter}
            hint="Matches any word in the day's note."
          />
        </View>

        <View style={styles.filterActions}>
          <View style={styles.filterActionSlot}>
            <Button label="Reset" onPress={resetFilter} variant="ghost" fullWidth />
          </View>
          <View style={styles.filterActionSlot}>
            <Button label="Apply" onPress={applyFilter} fullWidth />
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    list: {
      ...contentWidth,
      padding: spacing.lg,
      paddingBottom: spacing.xxxl,
    },
    listHeader: { gap: spacing.md, marginBottom: spacing.md },
    count: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.textMuted,
    },
    separator: { height: spacing.md },

    filteredEmpty: { gap: spacing.md, alignItems: 'flex-start', paddingVertical: spacing.lg },
    filteredEmptyTitle: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    filteredEmptyText: {
      fontSize: fontSize.sm,
      color: c.textMuted,
      lineHeight: scaledLine(fontSize.sm, 1.45),
    },

    filterSection: { gap: spacing.sm, marginBottom: spacing.lg },
    filterLabel: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.semibold,
      color: c.textMuted,
    },
    rangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: HIT_SIZE,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
    },
    pressed: { backgroundColor: c.surfaceAlt },
    rangeLabel: { fontSize: fontSize.md, color: c.text },
    rangeLabelSelected: { fontWeight: fontWeight.semibold, color: c.primary },

    filterActions: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
    filterActionSlot: { flex: 1 },
  });

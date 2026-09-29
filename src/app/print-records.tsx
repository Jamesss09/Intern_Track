import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import {
  contentWidth,
  fontSize,
  fontWeight,
  radius,
  scaledLine,
  spacing,
  NUMERIC,
} from '@/constants/theme';

type Action = 'generate' | 'print' | 'share';

export default function PrintRecordsScreen() {
  const { user, internship, summary } = useApp();
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [busy, setBusy] = useState<Action | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const generate = useCallback(async () => {
    if (!user || !internship) return null;

    setBusy('generate');
    setUri(null);
    try {
      const db = await getDatabase();
      const result = await pdfService.generateOjtRecordPdf(db, user, internship);
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
  }, [user, internship]);

  const onShare = useCallback(async () => {
    // Reuse an already-generated file; only build one if the screen was opened
    // straight into sharing.
    const target = uri ?? (await generate())?.uri;
    if (!target) return;

    setBusy('share');
    try {
      await pdfService.shareRecord(target);
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
  }, [uri, generate]);

  const onPrint = useCallback(async () => {
    if (!user || !internship) return;

    setBusy('print');
    try {
      const db = await getDatabase();
      await pdfService.printRecord(db, user, internship);
    } catch (error) {
      Alert.alert(
        'Printing failed',
        error instanceof Error ? error.message : 'Unknown error.',
      );
    } finally {
      setBusy(null);
    }
  }, [user, internship]);

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
          <Text style={styles.cardTitle}>What will be printed</Text>
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
            label="Create PDF"
            onPress={generate}
            loading={busy === 'generate'}
            disabled={busy !== null && busy !== 'generate'}
            fullWidth
            accessibilityHint="Builds the printable OJT record"
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
        sign-off, and should be able to confirm what they are sending first. So the
        sheet is the file row, and the system takes over from there.
      */}
      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="Send your record">
        <View style={styles.sheetFile}>
          <View style={styles.sheetIcon}>
            <Ionicons name="document-text" size={20} color={c.primaryOnSoft} />
          </View>
          <View style={styles.sheetText}>
            <Text style={styles.sheetName}>OJT Time Record</Text>
            <Text style={styles.sheetMeta}>
              {uri
                ? `PDF · ${pages ?? 1} ${pages === 1 ? 'page' : 'pages'} · ${formatHours(summary.completed)} hrs logged`
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

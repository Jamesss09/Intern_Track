import { useMemo } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/FormField';
import { ListRow } from '@/components/ListRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { formatShortDate } from '@/utils/dateFormatter';
import { formatHours } from '@/utils/progressCalculator';
import { contentWidth, fontSize, fontWeight, radius, scaledLine, spacing } from '@/constants/theme';

/**
 * Developer credit. Kept as a constant rather than read from `app.json` so it
 * renders identically in Expo Go and in a standalone build, where the embedded
 * config can differ.
 */
const DEVELOPER_NAME = 'James Carl Enquig';

/**
 * `expoConfig` is `ExpoConfig & { hostUri } | null` on `NativeConstants` in SDK
 * 57, and `version` is optional within it, so this is a double-nullable read
 * with a real fallback rather than a defensive cast.
 */
const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/**
 * Everything that is not the student's identity or their own hours.
 *
 * Profile keeps who you are and what you have logged. This keeps the settings
 * that apply to the app: appearance, the placement itself, security, the data
 * on the device, and who built it. Splitting them means neither screen is a
 * scroll of unrelated cards, and a student looking for "how do I get a PDF"
 * does not have to read past the OJT placement to find it.
 */
export default function SettingsScreen() {
  const { internship, summary, deleteAccount } = useApp();
  const { colors: c, elevation, mode, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const confirmDelete = () => {
    Alert.alert(
      'Delete everything?',
      `This permanently removes your account, your OJT details and every logged record from this device. It cannot be undone. Export a PDF first if you need a copy.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete permanently', style: 'destructive', onPress: () => void deleteAccount() },
      ],
    );
  };

  const isDark = mode === 'dark';

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Settings" />

      <ScrollView contentContainerStyle={styles.container}>
        {/* 1 — Appearance */}
        <View style={[styles.card, elevation.sm]}>
          <Text style={styles.cardTitle}>Appearance</Text>
          <View style={styles.themeRow}>
            <View style={styles.themeText}>
              <Text style={styles.themeLabel}>Dark mode</Text>
              <Text style={styles.muted}>
                {preference === 'system' ? 'Following your device setting' : `Always ${isDark ? 'dark' : 'light'}`}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={(next) => setPreference(next ? 'dark' : 'light')}
              trackColor={{ false: c.border, true: c.primary }}
              thumbColor={isDark ? c.onPrimary : c.surface}
              accessibilityLabel="Dark mode"
              accessibilityHint="Switch between the dark and light appearance"
            />
          </View>
          {preference !== 'system' ? (
            <Pressable
              onPress={() => setPreference('system')}
              style={styles.resetLink}
              accessibilityRole="button"
              accessibilityLabel="Follow device setting"
            >
              <Ionicons name="phone-portrait-outline" size={15} color={c.primary} />
              <Text style={styles.resetText}>Follow device setting</Text>
            </Pressable>
          ) : null}
        </View>

        {/* 2 — OJT Details */}
        <View style={[styles.card, elevation.sm]}>
          <Text style={styles.cardTitle}>OJT details</Text>
          {internship ? (
            <View style={styles.rows}>
              <ListRow icon="business-outline" label="Company" value={internship.company_name} />
              <ListRow icon="briefcase-outline" label="Position" value={internship.position} />
              <ListRow
                icon="time-outline"
                label="Required hours"
                value={`${formatHours(internship.required_hours)} hrs`}
              />
              <ListRow
                icon="calendar-outline"
                label="Period"
                // Short form, because `ListRow` caps its value at one line and
                // "28 September 2026 - 15 January 2027" would be clipped.
                value={`${formatShortDate(internship.start_date)} – ${
                  internship.end_date ? formatShortDate(internship.end_date) : 'Ongoing'
                }`}
              />
              {summary ? (
                <>
                  <ListRow
                    icon="checkmark-circle-outline"
                    label="Days logged"
                    value={String(summary.dayCount)}
                  />
                  {/*
                    Completed / remaining / required are read from the same
                    `summary` the Progress tab and the PDF both use, so the three
                    numbers cannot disagree. `remaining` is already clamped at 0
                    by `summarize`, so a student who over-completes sees 0 rather
                    than a negative balance.
                  */}
                  <ListRow
                    icon="trending-up-outline"
                    label="Completed"
                    value={`${formatHours(summary.completed)} hrs`}
                  />
                  <ListRow
                    icon="hourglass-outline"
                    label="Remaining"
                    value={`${formatHours(summary.remaining)} hrs`}
                  />
                  <ListRow
                    icon="flag-outline"
                    label="Required"
                    value={`${formatHours(summary.required)} hrs`}
                  />
                </>
              ) : null}
              <Link href="/internship-setup" asChild>
                <Button
                  label="Edit OJT Details"
                  onPress={() => {}}
                  variant="secondary"
                  fullWidth
                />
              </Link>
            </View>
          ) : (
            <View style={styles.rows}>
              <Text style={styles.muted}>No placement set up yet.</Text>
              <Link href="/internship-setup" asChild>
                <Button label="Add OJT Details" onPress={() => {}} fullWidth />
              </Link>
            </View>
          )}
        </View>

        {/* 3 — Security */}
        <View style={[styles.card, elevation.sm]}>
          <Text style={styles.cardTitle}>Security</Text>
          <Link href="/change-password" asChild>
            <ListRow
              icon="lock-closed-outline"
              label="Change password"
              onPress={() => {}}
            />
          </Link>
          {/*
            Listed as a row rather than omitted, so a student who goes looking
            for a verification toggle finds the answer instead of concluding the
            app is missing one. "Not applicable" is the honest value: the
            password hash is the only credential, and it never leaves the device.
          */}
          <ListRow
            icon="finger-print-outline"
            label="Two-factor verification"
            value="Not applicable"
          />
          <Text style={styles.muted}>
            There is no password reset. Your account lives only on this device, so a forgotten
            password means deleting the data in the app and every hour logged with it.
          </Text>
        </View>

        {/* 4 — Data & Account */}
        <View style={[styles.card, elevation.sm]}>
          <Text style={styles.cardTitle}>Data &amp; account</Text>
          <Text style={styles.muted}>
            Everything is stored only on this device. Uninstalling the app deletes it, so export
            a PDF before you do.
          </Text>
          <Link href="/print-records" asChild>
            <Button
              label="Export OJT Record (PDF)"
              onPress={() => {}}
              variant="secondary"
              fullWidth
            />
          </Link>
          {/*
            Delete Account keeps `danger` and Sign Out — now on Profile — stays
            `secondary`. Painting both red would flatten the difference between
            ending a session and erasing every logged hour.
          */}
          <Button label="Delete Account" onPress={confirmDelete} variant="danger" fullWidth />
        </View>

        {/* 5 — About */}
        <View style={[styles.card, elevation.sm]}>
          <Text style={styles.cardTitle}>About</Text>
          <ListRow icon="information-circle-outline" label="App" value="InternTrack" />
          <ListRow icon="person-outline" label="Developer" value={DEVELOPER_NAME} />
          <ListRow icon="pricetag-outline" label="Version" value={APP_VERSION} />
          <Text style={styles.muted}>
            An offline logbook for OJT hours. No account server, no tracking, no network calls —
            everything stays on this device until you delete it.
          </Text>
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
    cardTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },

    rows: { gap: spacing.xs },

    muted: {
      fontSize: fontSize.sm,
      color: c.textMuted,
      lineHeight: scaledLine(fontSize.sm, 1.5),
    },

    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.lg,
    },
    themeText: { flex: 1, gap: 2 },
    themeLabel: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
    },
    resetLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      alignSelf: 'flex-start',
      paddingVertical: spacing.xs,
    },
    resetText: {
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
      color: c.primary,
    },
  });

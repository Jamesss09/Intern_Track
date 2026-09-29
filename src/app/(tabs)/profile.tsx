import { useMemo, useState } from 'react';
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
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/Avatar';
import { Button, ControlledField } from '@/components/FormField';
import { ListRow } from '@/components/ListRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { formatShortDate } from '@/utils/dateFormatter';
import { formatHours } from '@/utils/progressCalculator';
import { contentWidth, fontSize, fontWeight, radius, scaledLine, spacing } from '@/constants/theme';

const schema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  student_id: z.string().optional(),
  course: z.string().optional(),
  year_level: z.string().optional(),
});

type ProfileValues = z.infer<typeof schema>;

export default function ProfileScreen() {
  const { user, internship, summary, updateProfile, logout, deleteAccount, busy } = useApp();
  const { colors: c, elevation, mode, preference, setPreference } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [editing, setEditing] = useState(false);

  const { control, handleSubmit, reset } = useForm<ProfileValues>({
    resolver: zodResolver(schema),
    values: {
      full_name: user?.full_name ?? '',
      student_id: user?.student_id ?? '',
      course: user?.course ?? '',
      year_level: user?.year_level ?? '',
    },
  });

  if (!user) return null;

  const onSave = handleSubmit(async (values) => {
    await updateProfile({
      full_name: values.full_name,
      student_id: values.student_id || null,
      course: values.course || null,
      year_level: values.year_level || null,
    });
    setEditing(false);
  });

  const onCancel = () => {
    reset();
    setEditing(false);
  };

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
      <ScreenHeader title="Profile" />

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, styles.identityCard, elevation.sm]}>
          <View style={styles.identity}>
            {/*
              No camera badge. The mockup's avatar carries one, but `Avatar`
              documents why it stays off: there is no image picker in v1, and a
              badge that looks tappable but does nothing is worse than none. It
              turns on when picking lands.
            */}
            <Avatar name={user.full_name} size={64} />

            <View style={styles.identityText}>
              <Text style={styles.identityName} numberOfLines={1}>
                {user.full_name}
              </Text>
              <Text style={styles.identityMeta} numberOfLines={1}>
                {user.email}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, elevation.sm]}>
          <Text style={styles.cardTitle}>Your details</Text>

          {editing ? (
            <View style={styles.form}>
              <ControlledField
                control={control}
                name="full_name"
                label="Full name"
                icon="person-outline"
                autoCapitalize="words"
              />
              <ControlledField
                control={control}
                name="student_id"
                label="Student number"
                icon="id-card-outline"
                autoCapitalize="characters"
              />
              <ControlledField
                control={control}
                name="course"
                label="Course / programme"
                icon="book-outline"
                autoCapitalize="words"
              />
              <ControlledField
                control={control}
                name="year_level"
                label="Year level"
                icon="ribbon-outline"
              />
              <View style={styles.buttonRow}>
                <View style={styles.buttonSlot}>
                  <Button label="Save" onPress={onSave} loading={busy} fullWidth />
                </View>
                <View style={styles.buttonSlot}>
                  <Button label="Cancel" onPress={onCancel} variant="secondary" fullWidth />
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.rows}>
              <ListRow icon="id-card-outline" label="Student number" value={user.student_id ?? '—'} />
              <ListRow icon="book-outline" label="Course" value={user.course ?? '—'} />
              <ListRow icon="ribbon-outline" label="Year level" value={user.year_level ?? '—'} />
              <Button
                label="Edit Details"
                onPress={() => setEditing(true)}
                variant="secondary"
                fullWidth
              />
            </View>
          )}
        </View>

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

        <View style={[styles.card, elevation.sm]}>
          <Text style={styles.cardTitle}>OJT placement</Text>
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
                <ListRow
                  icon="checkmark-circle-outline"
                  label="Days logged"
                  value={String(summary.dayCount)}
                />
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

        <View style={[styles.card, elevation.sm]}>
          <Text style={styles.cardTitle}>Security</Text>
          <Link href="/change-password" asChild>
            <ListRow
              icon="lock-closed-outline"
              label="Change password"
              onPress={() => {}}
            />
          </Link>
          <Text style={styles.muted}>
            There is no password reset. Your account lives only on this device, so a forgotten
            password means deleting the data in the app and every hour logged with it.
          </Text>
        </View>

        <View style={[styles.card, elevation.sm]}>
          <Text style={styles.cardTitle}>Your data</Text>
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
        </View>

        {/*
          Sign Out stays `secondary` rather than the mockup's red. Delete Account
          is the irreversible one and already carries `danger`; painting both red
          would flatten the difference between ending a session and erasing
          everything.
        */}
        <View style={styles.dangerZone}>
          <Button label="Sign Out" onPress={logout} variant="secondary" fullWidth />
          <Button label="Delete Account" onPress={confirmDelete} variant="danger" fullWidth />
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

    /** The identity card centres its content; every other card is left-aligned. */
    identityCard: { alignItems: 'center' },
    identity: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    identityText: { flex: 1, gap: 2 },
    identityName: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.text,
    },
    identityMeta: {
      fontSize: fontSize.sm,
      color: c.textMuted,
    },

    rows: { gap: spacing.xs },
    form: { gap: spacing.md },
    buttonRow: { flexDirection: 'row', gap: spacing.md },
    buttonSlot: { flex: 1 },

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

    dangerZone: { gap: spacing.md },
  });

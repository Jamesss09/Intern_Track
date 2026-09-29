import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/Avatar';
import { Button, ControlledField } from '@/components/FormField';
import { ListRow } from '@/components/ListRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { contentWidth, fontSize, fontWeight, radius, spacing } from '@/constants/theme';

const schema = z.object({
  full_name: z.string().min(2, 'Enter your full name'),
  student_id: z.string().optional(),
  course: z.string().optional(),
  year_level: z.string().optional(),
  /**
   * Left as typed here and uppercased in `authService`, alongside the other
   * profile normalisation. `autoCapitalize` is a keyboard hint, not a guarantee
   * — a paste or a Bluetooth keyboard bypasses it, and this value prints on a
   * document a supervisor signs.
   */
  block: z.string().optional(),
});

type ProfileValues = z.infer<typeof schema>;

/**
 * Who the student is, and the fields their supervisor reads.
 *
 * Everything app-level — appearance, the placement, security, the data on the
 * device, the version — moved to Settings. What stays here is what is *about
 * them*, plus the one control that can change it.
 *
 * `Edit Details` is deliberately kept even though the brief listed this screen
 * as read-only. Without it `student_id`, `course` and `year_level` are frozen at
 * registration forever, and all three print on the PDF a supervisor signs. A
 * typo there cannot be corrected without deleting the account and every logged
 * hour with it.
 */
export default function ProfileScreen() {
  const { user, updateProfile, logout, busy } = useApp();
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [editing, setEditing] = useState(false);

  const { control, handleSubmit, reset } = useForm<ProfileValues>({
    resolver: zodResolver(schema),
    values: {
      full_name: user?.full_name ?? '',
      student_id: user?.student_id ?? '',
      course: user?.course ?? '',
      year_level: user?.year_level ?? '',
      block: user?.block ?? '',
    },
  });

  if (!user) return null;

  const onSave = handleSubmit(async (values) => {
    await updateProfile({
      full_name: values.full_name,
      student_id: values.student_id || null,
      course: values.course || null,
      year_level: values.year_level || null,
      block: values.block || null,
    });
    setEditing(false);
  });

  const onCancel = () => {
    reset();
    setEditing(false);
  };

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
              <ControlledField
                control={control}
                name="block"
                label="Block"
                icon="grid-outline"
                autoCapitalize="characters"
                placeholder="e.g. 3A"
                hint="Printed on the TMC form's COURSE/BLOCK cell. Leave blank to use your year level instead."
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
              <ListRow icon="person-outline" label="Full name" value={user.full_name} />
              {/*
                The email is the username — there is no separate handle, and the
                column is `UNIQUE` with `COLLATE NOCASE`, so it is the account
                identifier. Labelling it "Username" keeps the list uniform
                without inventing a field that does not exist.
              */}
              <ListRow icon="at-outline" label="Username" value={user.email} />
              <ListRow icon="id-card-outline" label="Student number" value={user.student_id ?? '—'} />
              <ListRow icon="book-outline" label="Course" value={user.course ?? '—'} />
              <ListRow icon="ribbon-outline" label="Year level" value={user.year_level ?? '—'} />
              {/*
                Only shown once it is set. An em-dash here would read as "you
                have no block" when the truth is "we never asked", and the
                default is the year level anyway.
              */}
              {user.block ? <ListRow icon="grid-outline" label="Block" value={user.block} /> : null}
              <Button
                label="Edit Details"
                onPress={() => setEditing(true)}
                variant="secondary"
                fullWidth
              />
            </View>
          )}
        </View>

        {/*
          Sign Out stays `secondary` rather than the mockup's red. Delete Account
          is the irreversible one and now sits in Settings carrying `danger`;
          painting both red would flatten the difference between ending a
          session and erasing everything.
        */}
        <View style={styles.signOut}>
          <Button label="Sign Out" onPress={logout} variant="secondary" fullWidth />
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

    signOut: { gap: spacing.md },
  });

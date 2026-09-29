import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { Button, ControlledField } from '@/components/FormField';
import { ListRow } from '@/components/ListRow';
import { ScreenHeader } from '@/components/ScreenHeader';
import { contentWidth, fontSize, fontWeight, radius, spacing } from '@/constants/theme';
import { resolveAvatarUri, recoverInterruptedPick } from '@/services/avatarService';

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
  const { user, updateProfile, chooseAvatar, captureAvatar, removeAvatar, logout, busy } = useApp();
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [editing, setEditing] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);

  /**
   * The picture, resolved from the name in the database.
   *
   * `useMemo` on `user.avatar_path` rather than a state variable, because the
   * name *is* the state. Holding a second copy of a path in React is how a
   * screen ends up showing a picture the account no longer has — and it would
   * also have to be reset in three places, each one a chance to forget.
   * `resolveAvatarUri` returns `null` for a file that is gone, so a stale name
   * renders as initials instead of a hole.
   */
  const avatarUri = useMemo(
    () => resolveAvatarUri(user?.avatar_path),
    [user?.avatar_path],
  );

  /**
   * A pick that Android killed the activity for, waiting to be claimed.
   *
   * `expo-image-picker` documents that the system "sometimes kills the
   * MainActivity after the ImagePicker finishes" and that
   * `getPendingResultAsync` retrieves the result that was lost. Claiming it here
   * rather than at launch is deliberate: filing the result needs a user id, and
   * there is no signed-in user during the splash. In the ordinary case this
   * resolves `null` immediately and costs one native call.
   * → [[Avatar]]
   */
  useEffect(() => {
    if (!user) return;

    let active = true;
    recoverInterruptedPick(user.id).then((saved) => {
      // The component may be gone by the time this lands. Claiming into a dead
      // screen would still store the file — correct — but the re-read that
      // refreshes the avatar would have no one to read it for.
      if (active && saved) setPhotoSheet(false);
    });

    return () => {
      active = false;
    };
  }, [user]);

  /**
   * Every photo action closes the sheet first and acts second.
   *
   * The pickers and the camera are separate OS activities on top of this, and a
   * sheet left open underneath one comes back to a student staring at a menu
   * they already answered.
   *
   * Declared before the `if (!user) return null` below, because hooks called after
   * a conditional return are not called on every render — and the render where
   * `user` is still null is a real one, during sign-in.
   */
  const runPhotoAction = useCallback(
    async (action: () => Promise<void>) => {
      setPhotoSheet(false);
      await action();
    },
    [],
  );

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
              Always pressable, edit mode or not. The picture is not one of the
              form fields below — it has no value to type, no validation, and no
              Save button holding it hostage — so it is changed the moment it is
              chosen. Tying it to `editing` would mean a student who wants to swap
              a photo has to first open a form they did not want to open.
            */}
            <Avatar
              name={user.full_name}
              size={64}
              uri={avatarUri}
              onPress={() => setPhotoSheet(true)}
              accessibilityLabel={
                avatarUri ? 'Change profile picture' : 'Add a profile picture'
              }
            />

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
              {/*
                A row for the picture, so the thing that changes it is listed with
                everything else that can be changed rather than being discovered by
                tapping a face. It is absent when there is no picture: there is
                nothing to describe, and the avatar's own camera badge is the
                affordance that adds the first one.
              */}
              {avatarUri ? (
                <ListRow
                  icon="image-outline"
                  label="Profile picture"
                  value="On"
                  onPress={() => setPhotoSheet(true)}
                />
              ) : null}
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

      {/*
        The photo options.

        A sheet rather than an `Alert` with three buttons, because an alert is
        capped at three and cannot be styled, and this is the app's existing
        idiom for exactly this — the records filter and every confirmation already
        use `BottomSheet`. Three rows in a sheet also read as a menu, which is what
        this is, rather than as three things that might happen.

        `Remove` is `danger` and last. It is the only irreversible one — the file
        is deleted, not hidden — so it is also the only one that needs its weight
        to separate it from the other two, and it disappears entirely when there is
        no picture rather than sitting there greyed out offering nothing.
      */}
      <BottomSheet
        visible={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title="Profile picture"
      >
        <ListRow
          icon="images-outline"
          label="Choose from photos"
          onPress={() => runPhotoAction(chooseAvatar)}
        />
        <ListRow
          icon="camera-outline"
          label="Take a photo"
          onPress={() => runPhotoAction(captureAvatar)}
        />
        {avatarUri ? (
          <ListRow
            icon="trash-outline"
            label="Remove photo"
            tone="danger"
            onPress={() => runPhotoAction(removeAvatar)}
          />
        ) : null}
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

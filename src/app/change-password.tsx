import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Button, ControlledField } from '@/components/FormField';
import { ScreenHeader } from '@/components/ScreenHeader';
import * as authService from '@/services/authService';
import { passwordSchema } from '@/utils/passwordSchema';
import { contentWidth, fontSize, fontWeight, radius, scaledLine, spacing } from '@/constants/theme';

const schema = z
  .object({
    current_password: z.string().min(1, 'Enter your current password'),
    new_password: passwordSchema,
    confirm_password: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  });

type ChangeValues = z.infer<typeof schema>;

/**
 * Change password.
 *
 * There is no "forgot password" link anywhere in this app and there cannot be
 * one: no server, no email, no recovery key. The account is a row in a SQLite
 * file inside the install, so a forgotten password can only be resolved by
 * deleting the app's data — which destroys every logged hour with it. Saying so
 * here, where the user is actually choosing a password, is the only mitigation
 * available. See vault note `Security` -> "Data Loss".
 */
export default function ChangePasswordScreen() {
  const { user, clearError, error: contextError } = useApp();
  const { colors: c, elevation } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [busy, setBusy] = useState(false);
  /** Set by the service, kept separate from the context's unrelated errors. */
  const [failure, setFailure] = useState<string | null>(null);

  const { control, handleSubmit, reset } = useForm<ChangeValues>({
    resolver: zodResolver(schema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!user) return;

    setBusy(true);
    setFailure(null);
    clearError();

    try {
      await authService.changePassword(user.id, values.current_password, values.new_password);
      // Cleared rather than left on screen: a stale password sitting in a text
      // input is a shoulder-surfing risk, and the screen is about to unmount.
      reset();
      router.back();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  });

  /** Any keystroke clears the previous attempt's complaint. */
  const onEdit = useCallback(() => {
    if (failure) setFailure(null);
  }, [failure]);

  const message = failure ?? contextError;

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Change Password" onBack={() => router.back()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={[styles.card, elevation.sm]}>
            <Text style={styles.cardTitle}>Set a new password</Text>

            <ControlledField
              control={control}
              name="current_password"
              label="Current password"
              onEdit={onEdit}
              icon="lock-closed-outline"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
            />

            <ControlledField
              control={control}
              name="new_password"
              label="New password"
              onEdit={onEdit}
              icon="key-outline"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              hint="At least 8 characters, with a letter and a number."
            />

            <ControlledField
              control={control}
              name="confirm_password"
              label="Confirm new password"
              onEdit={onEdit}
              icon="checkmark-circle-outline"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
            />
          </View>

          {message ? (
            <View style={styles.alert} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={16} color={c.danger} />
              <Text style={styles.alertText}>{message}</Text>
            </View>
          ) : null}

          {/*
            Stated here rather than only on the login screen: this is the last
            moment at which the user is choosing a password, and the consequence
            of forgetting it is far more expensive than it looks.
          */}
          <View style={styles.notice}>
            <View style={styles.noticeHeader}>
              <Ionicons name="warning-outline" size={16} color={c.primaryOnSoft} />
              <Text style={styles.noticeTitle}>There is no password reset</Text>
            </View>
            <Text style={styles.noticeText}>
              Your account is stored only on this device, with no email or server behind it. If
              this password is forgotten, the only way back in is to delete the data in the app —
              and that deletes every hour you have logged.
            </Text>
          </View>

          <View style={styles.actions}>
            <Button label="Update Password" onPress={onSubmit} loading={busy} fullWidth />
            <Button
              label="Cancel"
              onPress={() => router.back()}
              variant="secondary"
              fullWidth
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
      gap: spacing.lg,
    },
    cardTitle: {
      fontSize: fontSize.md,
      fontWeight: fontWeight.semibold,
      color: c.text,
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

    actions: { gap: spacing.md },
  });

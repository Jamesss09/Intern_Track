import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Button, ControlledField } from '@/components/FormField';
import { AUTH_ERRORS, TooManyAttemptsError } from '@/services/authService';
import { contentWidth, fontSize, fontWeight, radius, scaledLine, spacing } from '@/constants/theme';
import splashIcon from '../../../assets/splash-icon.png';

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const { login, busy, error, clearError } = useApp();
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const [submitted, setSubmitted] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);

  const locked = retryAfter > 0;

  // Chained timeouts, not a `setInterval`. An interval declared once would drift
  // against the real clock and would keep firing after the count reached zero
  // unless every render re-created it; here each tick schedules its own successor
  // and the cleanup cancels the pending one on unmount.
  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setTimeout(() => setRetryAfter((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [retryAfter]);

  const { control, handleSubmit } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitted(true);
    clearError();
    setRetryAfter(0);
    try {
      await login(values.email, values.password);
    } catch (error) {
      // Already surfaced through `error` in context. The countdown is the one
      // thing this screen has to add, and the typed error carries it.
      if (error instanceof TooManyAttemptsError) setRetryAfter(error.retryAfterSeconds);
    }
  });

  const onEdit = () => {
    // Guarded on the lockout: a keystroke would otherwise wipe the only thing
    // explaining why the button is disabled.
    if (submitted && retryAfter <= 0) clearError();
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* The mockup's lockup: mark, two-tone wordmark, tagline. The same three
            parts appear on the splash, so the two screens read as one brand
            moment rather than two. */}
        <View style={styles.header}>
          <Image source={splashIcon} style={styles.mark} resizeMode="contain" />

          <Text style={styles.wordmark} accessibilityRole="header">
            <Text style={styles.wordFirst}>Intern</Text>
            <Text style={styles.wordSecond}>Track</Text>
          </Text>

          <Text style={styles.tagline}>Track Your OJT. Build Your Future.</Text>
        </View>

        {/* No card. The mockup sets the fields straight onto the page, and a
            single card around two inputs is a box inside a box. */}
        <View style={styles.form}>
          <ControlledField
            control={control}
            name="email"
            label="Email address"
            icon="person-outline"
            placeholder="juan@email.com"
            onEdit={onEdit}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />

          <ControlledField
            control={control}
            name="password"
            label="Password"
            icon="lock-closed-outline"
            onEdit={onEdit}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />

          {/* One alert, one error channel: the live text is still the context
              `error`. Only the lockout swaps it, and only for its fixed half —
              the seconds render beside the live region as a sibling, so a
              screen reader announces "Too many attempts." once rather than
              relaying a new number every second for up to five minutes. */}
          {error || locked ? (
            <View style={styles.alert}>
              <Ionicons name="alert-circle" size={16} color={c.danger} />
              <View style={styles.alertBody}>
                <Text style={styles.alertText} accessibilityLiveRegion="polite">
                  {locked ? AUTH_ERRORS.tooManyAttemptsHead : error}
                </Text>
                {locked ? <Text style={styles.countdown}>Try again in {retryAfter}s</Text> : null}
              </View>
            </View>
          ) : null}

          <Button label="Login" onPress={onSubmit} loading={busy} disabled={locked} fullWidth />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Don&apos;t have an account?{' '}
            <Link href="/(auth)/register" asChild>
              <Text style={styles.footerLink}>Register</Text>
            </Link>
          </Text>

          {/*
            The absence of a "forgot password" link is otherwise just a missing
            feature. It is not one — with no server and no email there is nothing
            to send a reset to, and the only recovery is deleting the app's data,
            which takes every logged hour with it. Better said here than
            discovered by a student who is already locked out.
          */}
          <View style={styles.noReset}>
            <Ionicons name="information-circle-outline" size={14} color={c.textMuted} />
            <Text style={styles.noResetText}>
              Accounts are stored only on this device. There is no password reset — if you forget
              your password, you will need to delete the app&apos;s data and start again.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.bg },
    container: {
      ...contentWidth,
      flexGrow: 1,
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.xxl,
    },
    header: { gap: spacing.sm, alignItems: 'center' },
    mark: { width: 64, height: 64 },
    wordmark: {
      fontSize: fontSize.xxl,
      fontWeight: fontWeight.bold,
      letterSpacing: -0.5,
    },
    wordFirst: { color: c.text },
    /** The two-tone split from the mockup, on a token rather than a literal. */
    wordSecond: { color: c.primary },
    tagline: {
      fontSize: fontSize.sm,
      color: c.textMuted,
      textAlign: 'center',
    },

    form: { gap: spacing.lg },

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
    alertBody: { flex: 1, gap: 2 },
    alertText: {
      color: c.danger,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
    },
    /**
     * `tabular-nums` so the number does not shuffle sideways as digits change —
     * without it a 3-digit countdown visibly jitters once a second.
     */
    countdown: {
      color: c.danger,
      fontSize: fontSize.xs,
      fontWeight: fontWeight.bold,
      fontVariant: ['tabular-nums'],
    },

    footer: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.lg },
    noReset: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      maxWidth: 340,
    },
    noResetText: {
      flex: 1,
      fontSize: fontSize.xs,
      color: c.textMuted,
      lineHeight: scaledLine(fontSize.xs, 1.5),
    },
    footerText: { fontSize: fontSize.md, color: c.textMuted },
    footerLink: {
      color: c.primary,
      fontWeight: fontWeight.bold,
    },
  });

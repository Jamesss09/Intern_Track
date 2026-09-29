import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { passwordSchema } from '@/utils/passwordSchema';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Button, ControlledField } from '@/components/FormField';
import { contentWidth, fontSize, fontWeight, radius, scaledLine, spacing } from '@/constants/theme';

/**
 * The password rule lives in the schema as explicit checks rather than one
 * opaque regex, so the message the user reads is literally the condition that
 * decides whether the form is valid.
 */
const schema = z
  .object({
    full_name: z.string().min(2, 'Enter your full name'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    student_id: z.string().optional(),
    course: z.string().optional(),
    year_level: z.string().optional(),
    block: z.string().optional(),
    password: passwordSchema,
    confirm_password: z.string().min(1, 'Confirm your password'),
  })
  .refine((values) => values.password === values.confirm_password, {
    path: ['confirm_password'],
    message: 'Passwords do not match',
  });

type RegisterValues = z.infer<typeof schema>;

const DEFAULTS: RegisterValues = {
  full_name: '',
  email: '',
  student_id: '',
  course: '',
  year_level: '',
  block: '',
  password: '',
  confirm_password: '',
};

export default function RegisterScreen() {
  const { register: createAccount, busy, error, clearError } = useApp();
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();

  const { control, handleSubmit } = useForm<RegisterValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
    mode: 'onBlur',
  });

  // Live so the avatar fills in as they type their name, the way the mockup's
  // profile screen does. `useWatch` rather than the form's own `watch`, which
  // returns an unmemoizable function and makes the compiler skip this screen.
  const name = useWatch({ control, name: 'full_name' });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitted(true);
    clearError();
    try {
      await createAccount({
        full_name: values.full_name,
        email: values.email,
        password: values.password,
        student_id: values.student_id || null,
        course: values.course || null,
        year_level: values.year_level || null,
        block: values.block || null,
      });
    } catch {
      // Already surfaced through `error` in context.
    }
  });

  const onEdit = () => {
    if (submitted) clearError();
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader title="Create Account" onBack={() => router.back()} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.lead}>
            <Avatar name={name ?? ''} size={72} />
            <Text style={styles.leadText}>
              These details appear on the printed OJT record, so fill them in the way your school
              expects.
            </Text>
          </View>

          <View style={styles.form}>
            <ControlledField
              control={control}
              name="full_name"
              label="Full name"
              icon="person-outline"
              placeholder="Juan Dela Cruz"
              onEdit={onEdit}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
            />

            <ControlledField
              control={control}
              name="email"
              label="Email address"
              icon="mail-outline"
              placeholder="juan@email.com"
              onEdit={onEdit}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
            />

            <ControlledField
              control={control}
              name="student_id"
              label="Student ID (optional)"
              icon="school-outline"
              placeholder="e.g. 2024-12345"
              onEdit={onEdit}
              autoCapitalize="characters"
            />

            <ControlledField
              control={control}
              name="course"
              label="Course (optional)"
              icon="book-outline"
              placeholder="e.g. BSIT"
              onEdit={onEdit}
              autoCapitalize="words"
            />

            <ControlledField
              control={control}
              name="year_level"
              label="Year level (optional)"
              icon="ribbon-outline"
              placeholder="e.g. 4th Year"
              onEdit={onEdit}
            />

            <ControlledField
              control={control}
              name="block"
              label="Block (optional)"
              icon="grid-outline"
              placeholder="e.g. 3A"
              hint="Your section, as the registrar lists it. Used on the TMC form's COURSE/BLOCK cell."
              onEdit={onEdit}
              autoCapitalize="characters"
            />

            <View style={styles.divider} />

            <ControlledField
              control={control}
              name="password"
              label="Password"
              icon="lock-closed-outline"
              onEdit={onEdit}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              hint="At least 8 characters, with a letter and a number."
            />

            <ControlledField
              control={control}
              name="confirm_password"
              label="Confirm password"
              icon="checkmark-circle-outline"
              onEdit={onEdit}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
            />

            {error ? (
              <View style={styles.alert} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle" size={16} color={c.danger} />
                <Text style={styles.alertText}>{error}</Text>
              </View>
            ) : null}

            <Button label="Register" onPress={onSubmit} loading={busy} fullWidth />
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
      padding: spacing.xl,
      gap: spacing.xl,
      paddingBottom: spacing.xxxl,
    },
    lead: {
      alignItems: 'center',
      gap: spacing.md,
    },
    leadText: {
      fontSize: fontSize.sm,
      color: c.textMuted,
      lineHeight: scaledLine(fontSize.sm, 1.5),
      textAlign: 'center',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: spacing.xs,
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
    alertText: {
      flex: 1,
      color: c.danger,
      fontSize: fontSize.sm,
      fontWeight: fontWeight.medium,
    },
  });

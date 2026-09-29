import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { fontSize, fontWeight, scaledLine, spacing } from '@/constants/theme';

interface EmptyStateProps {
  title: string;
  message: string;
  action?: React.ReactNode;
}

/** Shown instead of a list or form when there is genuinely nothing to show. */
export const EmptyState = ({ title, message, action }: EmptyStateProps) => {
  const { colors: c } = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <View style={styles.container}>
      <View style={styles.rule} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
};

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xxxl,
      paddingHorizontal: spacing.xl,
    },
    /** A short accent rule instead of an illustration: no asset to ship. */
    rule: {
      width: 40,
      height: 3,
      borderRadius: 2,
      backgroundColor: c.primary,
      marginBottom: spacing.sm,
    },
    title: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.text,
      textAlign: 'center',
    },
    message: {
      fontSize: fontSize.md,
      color: c.textMuted,
      textAlign: 'center',
      lineHeight: scaledLine(fontSize.md, 1.5),
      maxWidth: 320,
    },
    action: { marginTop: spacing.md },
  });

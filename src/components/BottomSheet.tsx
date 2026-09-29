import type { ReactNode } from 'react';
import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { contentWidth, fontSize, fontWeight, radius, spacing } from '@/constants/theme';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * The share sheet and the records filter.
 *
 * `expo-sharing` already opens a system sheet, so this exists for the cases the
 * OS does not cover: choosing filter criteria, and a branded file row that
 * previews the export before it is handed off.
 *
 * A `Modal` rather than an absolutely-positioned overlay, so the Android back
 * button closes it — `onRequestClose` is mandatory on Android and a modal
 * without it makes the hardware back button exit the app instead.
 */
export const BottomSheet = ({ visible, onClose, title, children }: BottomSheetProps) => {
  const { colors: c, elevation } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Tapping the scrim dismisses. It sits behind the sheet, so a press
            that starts on the sheet never reaches it. */}
        <Pressable
          style={styles.scrim}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />

        <View style={[styles.sheet, elevation.lg, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabber} />

          {title ? <Text style={styles.title}>{title}</Text> : null}

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            // Capped so a long filter list cannot grow past the screen; the
            // sheet is a picker, not a page.
            bounces={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end' },
    scrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(10, 8, 20, 0.55)',
    },
    sheet: {
      // Capped and centred: a full-width sheet on a 1024 dp tablet is a
      // letterbox, not a sheet. `alignSelf` does the centring because the
      // backdrop is a column with `justifyContent: 'flex-end'`.
      ...contentWidth,
      backgroundColor: c.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingTop: spacing.sm,
      maxHeight: '85%',
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.borderStrong,
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSize.lg,
      fontWeight: fontWeight.bold,
      color: c.text,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    body: { flexGrow: 0 },
    bodyContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  });

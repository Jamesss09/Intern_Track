import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '@/hooks/useApp';
import { useTheme } from '@/hooks/useTheme';
import { OfflineToast } from '@/components/OfflineToast';
import { fontSize, fontWeight } from '@/constants/theme';

/**
 * Module scope, not component state, so "once" means once per *cold start*.
 *
 * A `useState` flag would reset when the user signs out and back in, and the
 * toast would greet them again — which would be a statement about a condition
 * that never changed, since the app is permanently offline either way. This
 * survives remounts and dies with the JS runtime.
 */
let offlineToastShown = false;

/** Lets the Dashboard settle before the toast drops over it. */
const TOAST_DELAY_MS = 700;

/**
 * Signed-in routes.
 *
 * `href: null` removes a tab from the bar without unmounting its screen, so the
 * default `/` (Dashboard) has no redundant tab. See vault note
 * `Architecture` -> "Decision 6".
 */
export default function TabsLayout() {
  const { status } = useApp();
  const { colors: c, mode } = useTheme();
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (offlineToastShown) return;
    offlineToastShown = true;

    const timer = setTimeout(() => setToastVisible(true), TOAST_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const screenOptions = useMemo(() => {
    // In light mode the bar is the mockup's dark band; in dark mode it stays
    // `surface`, because a `brandDark` bar under a near-black page is a large
    // purple block rather than a navigation strip. Each branch therefore needs
    // its own tints — `primary` does not read on either fill.
    const barOnBand = mode === 'light';

    return {
      headerStyle: { backgroundColor: c.bg },
      headerTitleStyle: { color: c.text, fontWeight: fontWeight.bold },
      headerTintColor: c.primary,
      headerShadowVisible: false,
      tabBarActiveTintColor: barOnBand ? c.primaryOnBrand : c.primary,
      // `textMuted`, not `textSubtle`: the inactive label is 11 px text, and
      // `textSubtle` measures 4.22:1 on `surface`, under the 4.5:1 floor.
      tabBarInactiveTintColor: barOnBand ? c.onBrand : c.textMuted,
      tabBarStyle: {
        backgroundColor: barOnBand ? c.brandDark : c.surface,
        // The band carries its own separation, so a hairline would only add a
        // line of near-black against near-black in dark mode.
        borderTopColor: barOnBand ? c.brandDark : c.border,
        borderTopWidth: barOnBand ? 0 : StyleSheet.hairlineWidth,
        /*
         * No `height`, `paddingTop` or `paddingBottom` here, deliberately.
         *
         * `getTabBarHeight` in the navigator reads `height` off this style and
         * returns it *immediately*, skipping the `insets.bottom` addition
         * entirely — so setting it silently removes bottom safe-area handling.
         * And because `tabBarStyle` is spread last in the style array, any
         * `paddingBottom` set here also overrides the library's own inset
         * padding. Together those put the labels inside the home-indicator /
         * gesture area on any device that has one.
         *
         * The default is `49 + insets.bottom` (the UIKit standard), which is
         * inset-correct on every device. Colours are ours; geometry is not.
         *
         * Residual: the bar is a fixed height, so a very large system font can
         * still crowd the 11 px label. See `UI Redesign` -> Responsiveness.
         */
      },
      tabBarLabelStyle: {
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
        // Inactive tabs are `onBrand` at 60% on the band, so the label carries
        // the same weight to match the icon rather than looking unselected.
        opacity: barOnBand ? 0.6 : 1,
      },
      sceneStyle: { backgroundColor: c.bg },
    };
  }, [c, mode]);

  // The navigator needs a flex parent now that the toast is layered over it.
  const styles = useMemo(() => StyleSheet.create({ root: { flex: 1 } }), []);

  if (status !== 'authenticated') return <Redirect href="/(auth)/login" />;

  return (
    <View style={styles.root}>
      <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          href: null,
          // The Dashboard draws its own full-bleed hero instead. A light `bg`
          // header above a navy hero would read as two competing bands.
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="records"
        options={{
          title: 'Records',
          // Replaced by the screen's own `ScreenHeader` band, which carries the
          // filter action.
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'list' : 'list-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              color={color}
              size={size}
            />
          ),
        }}
      />
      </Tabs>

      {/* A sibling of the navigator, not a child of a screen, so it survives
          tab switches and never re-mounts with the screen underneath it. */}
      <OfflineToast visible={toastVisible} onDismiss={() => setToastVisible(false)} />
    </View>
  );
}

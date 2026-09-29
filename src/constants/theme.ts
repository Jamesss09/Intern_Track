/**
 * Design tokens.
 *
 * Structure:
 *   palette  - raw colour ramps. Never consumed directly by a screen.
 *   light / dark - semantic tokens, resolved from the ramps.
 *   spacing / radius / fontSize / fontWeight / elevation - mode-independent
 *   metrics, except `elevation`, which is zeroed in dark mode.
 *
 * Screens import `useTheme()` and read semantic names (`c.surface`,
 * `c.textMuted`). They must not reference `palette` or a hardcoded hex: a
 * literal colour in a screen is invisible to dark mode and cannot be audited.
 *
 * Why two palettes rather than `light-dark()`: React Native has no
 * `light-dark()`, and computing opacity overlays at runtime is far harder to
 * reason about than two explicit, contrast-checked sets of values.
 *
 * Print output is deliberately NOT themed. The PDF is black on white in every
 * mode, because it is a document submitted to a school, not a view of the app.
 */

import { PixelRatio } from 'react-native';

/**
 * Brand ramp. Royal purple, tuned so `purple600` clears 6.7:1 on white and
 * `purple300` clears 6.3:1 on the dark surface, which keeps primary-coloured
 * text readable in both modes without a second "accessible primary" token.
 */
const purple = {
  50: '#F6F2FC',
  100: '#EDE4FA',
  200: '#DACBF6',
  300: '#BFA6F0',
  400: '#9E7BE6',
  500: '#7C4DD8',
  600: '#6B3FC4',
  700: '#522E9C',
  800: '#3C2274',
  900: '#26154A',
} as const;

/** Accent used by `dark.primary`, so it has to read as the same brand. */
const purpleDark = {
  300: '#A98BEC',
  400: '#BCA3F2',
  500: '#7C4DD8',
} as const;

/**
 * Semantic colour set. Written as an explicit interface rather than
 * `typeof light`, because `as const` would pin every value to a single literal
 * and make the dark palette a compile error rather than a checked assignment.
 */
export interface ThemeColors {
  /** Page background. Slightly cool and off-white, never pure #FFF. */
  bg: string;
  /** Cards sit on `bg` and are pure white, so they read as raised. */
  surface: string;
  /** Inset fills: table stripes, secondary panels, skeleton blocks. */
  surfaceAlt: string;
  /** Tinted panel, e.g. the "completed" callout. */
  surfaceTinted: string;

  /**
   * The dark band from the mockup: screen headers, and the tab bar in light
   * mode. Not a background — a *header* fill that content is meant to sit on.
   *
   * This is the only token in the file whose polarity inverts between modes. A
   * dark fill has to read as *below* `bg` in light mode and *above* it in dark
   * mode; a value that is merely dark is invisible in one of the two. Each
   * palette therefore names a different ramp step, and neither is a tint of the
   * other.
   */
  brandDark: string;
  /** Text and icons sitting on top of `brandDark`. */
  onBrand: string;
  /**
   * The active/selected accent when it sits on `brandDark` rather than on
   * `surface` — currently the tab bar's active icon and label.
   *
   * `primary` is a mid-ramp step and reaches only 3.0:1 on `brandDark`, which is
   * why the bar needs its own value instead of reusing `primary`. Inactive tabs
   * take `onBrand` at 60%, so the two are separated by saturation as well as by
   * lightness.
   */
  primaryOnBrand: string;

  border: string;
  borderStrong: string;

  text: string;
  textMuted: string;
  textSubtle: string;
  /**
   * Text on top of a saturated brand fill — `primary` buttons, the register
   * and login submits.
   *
   * This absorbed the old `onAccent`, which held identical values in both
   * palettes and so was a second name for one colour. `onDanger` remains
   * separate: it is only used where a full `danger` fill is the thing being
   * labelled, and 6.0:1 still clears the bar there.
   */
  onPrimary: string;

  primary: string;
  primaryPressed: string;
  primarySoft: string;
  primaryOnSoft: string;
  /** Outline for a quiet, low-emphasis button. */
  primaryOutline: string;

  danger: string;
  dangerPressed: string;
  dangerSoft: string;
  onDanger: string;

  warning: string;
  warningSoft: string;

  /**
   * Display accent for a headline figure — the orange "291h Completed" number in
   * the mockup.
   *
   * Deliberately *not* a second warning. `warning` means something is wrong;
   * `accent` only means "look here". The two are close in hue, so they are kept
   * far enough apart in value to stay distinguishable side by side, and both are
   * contrast-checked as text.
   */
  accent: string;
  accentSoft: string;

  success: string;
  successSoft: string;

  /**
   * Progress-bar groove. Deliberately a different step from `surface`, because
   * a groove in the card's own colour is invisible.
   */
  track: string;
}

const light: ThemeColors = {
  /** Page background. Slightly cool and off-white, never pure #FFF. */
  bg: '#F6F5FA',
  /** Cards sit on `bg` and are pure white, so they read as raised. */
  surface: '#FFFFFF',
  /** Inset fills: table stripes, secondary panels, pressed states. */
  surfaceAlt: '#F0EEF7',
  /** Tinted panel, e.g. the "requirement met" callout. */
  surfaceTinted: purple[50],

  /**
   * The deepest ramp step, so the header reads as a band *darker* than the page
   * behind it. `purple900` against `bg` is 15.0:1 — the step is unmistakable.
   */
  brandDark: purple[900],
  /** 16.3:1 on `brandDark`. */
  onBrand: '#FFFFFF',
  /** 7.7:1 on `brandDark` — the active tab. */
  primaryOnBrand: purple[300],

  border: '#E5E2EF',
  borderStrong: '#CFCBE0',

  text: '#17151F',
  textMuted: '#5C5870',
  textSubtle: '#8A8699',
  /** Text on top of `primary` / `danger` / `success` fills. */
  onPrimary: '#FFFFFF',

  primary: purple[600],
  primaryPressed: purple[700],
  primarySoft: '#EFE8FB',
  primaryOnSoft: '#4A2A8F',
  /** Outline for a quiet, low-emphasis button. */
  primaryOutline: purple[500],

  danger: '#B3261E',
  dangerPressed: '#8C1D17',
  dangerSoft: '#FBEAE8',
  onDanger: '#FFFFFF',

  warning: '#9A5B00',
  warningSoft: '#FDF1E0',

  /** 5.2:1 on white, so it is safe as text and not only as a fill. */
  accent: '#C2410C',
  accentSoft: '#FDEEE3',

  success: '#1E7A4D',
  successSoft: '#E4F4EC',

  /**
   * Progress-bar groove. A distinct step from `surface`, not a tint of it: the
   * empty part of the bar has to be visible as a groove, so this needs roughly
   * 1.4:1 against the card behind it to read at a glance.
   */
  track: '#DED8EE',
};

const dark: ThemeColors = {
  bg: '#100F16',
  surface: '#1A1922',
  surfaceAlt: '#232230',
  surfaceTinted: '#241D38',

  /**
   * Two ramp steps *lighter* than light mode's `purple900`, which is the whole
   * point of the token. On a near-black page a header has to be the lighter
   * surface or it vanishes; reusing `purple900` here would produce a band that
   * is technically present and visually absent.
   *
   * `purple800` against `dark.bg` is 1.52:1 — a visible step, not a border.
   * Against `dark.surface` it is 1.39:1, so the header still separates from the
   * cards directly beneath it.
   */
  brandDark: purple[800],
  /** 10.9:1 on `brandDark`. */
  onBrand: '#F0EEF7',
  /** 5.9:1 on `brandDark`. */
  primaryOnBrand: purpleDark[300],

  border: '#2E2C3B',
  borderStrong: '#464358',

  text: '#F0EEF7',
  textMuted: '#A9A5BC',
  textSubtle: '#7E7A92',
  onPrimary: '#150B29',

  primary: purpleDark[300],
  primaryPressed: purpleDark[400],
  primarySoft: '#2A2140',
  primaryOnSoft: '#C9B2F5',
  primaryOutline: purpleDark[500],

  danger: '#F2857A',
  dangerPressed: '#F7A79E',
  dangerSoft: '#3A1F1D',
  onDanger: '#3A1F1D',

  warning: '#E0A45C',
  warningSoft: '#3A2B15',

  /** Lightened for the dark surface, matching how `danger` and `warning` move. */
  accent: '#FB923C',
  accentSoft: '#3A2314',

  success: '#5FC48C',
  successSoft: '#14301F',

  /** See the note on `light.track`: needs ~1.4:1 against the card, not a tint. */
  track: '#3B3850',
};

export type ThemeMode = 'light' | 'dark';
export type Theme = { mode: ThemeMode; c: ThemeColors };

export const themes: Record<ThemeMode, Theme> = {
  light: { mode: 'light', c: light },
  dark: { mode: 'dark', c: dark },
};

/** Raw ramps, exported for the rare case that needs a specific step. */
export const palette = { purple } as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
  /** The one number the Progress screen exists to show. */
  display: 34,
} as const;

/**
 * `600` is included because it is a distinct optical weight from `700` on both
 * platforms; dropping it and rounding everything to 500/700 flattens headings.
 */
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export type FontWeight = (typeof fontWeight)[keyof typeof fontWeight];

/** Minimum touch target. Anything tappable smaller than this fails on Android. */
export const HIT_SIZE = 48;

/**
 * Device-dependent layout constraints. Mode-independent, but not style choices.
 *
 * The app is portrait-locked and `ios.supportsTablet` is on, so the real width
 * range is roughly 320 dp on a small Android phone to 1024 dp on an iPad held
 * in portrait. Everything between those has to lay out without clipping,
 * stretching into unreadable line lengths, or reflowing.
 */
export const layout = {
  /**
   * Where content stops widening and centres instead.
   *
   * Without a cap, a card row on a 1024 dp tablet is 1024 dp of full-width
   * card, and a paragraph runs to ~120 characters — the point where the eye
   * loses the start of the next line. 640 keeps a comfortable measure at every
   * width up to a large tablet.
   */
  maxContentWidth: 640,
} as const;

/**
 * Spread into a `contentContainerStyle` to make a screen width-aware.
 *
 * All three properties are load-bearing and none can be dropped:
 *  - `width: '100%'` — without it, `alignSelf: 'center'` makes the container
 *    shrink-to-fit its children, and the cards inside collapse to their text.
 *  - `maxWidth` — the cap that makes `alignSelf` have anything to do.
 *  - `alignSelf: 'center'` — centres the column once the cap bites.
 *
 * Belongs on the `contentContainer`, not on the `ScrollView` itself: the scroll
 * surface must stay full-bleed so a wide screen can still scroll a long list,
 * and the header band above it must still reach both edges.
 */
export const contentWidth = {
  width: '100%',
  maxWidth: layout.maxContentWidth,
  alignSelf: 'center',
} as const;

/**
 * A `lineHeight` that survives a large system font size.
 *
 * In React Native `fontSize` scales with the OS accessibility setting but
 * `lineHeight` does not. So a literal `lineHeight: fontSize.sm * 1.5` is correct
 * at 100% and clips its own glyphs at 200% — the text grows, the line box does
 * not, and consecutive lines overlap. This multiplies in the current font scale
 * so the two stay in proportion.
 *
 * Read per style build rather than subscribed to: changing the OS font size
 * restarts the JS runtime on Android, and on iOS the new value is picked up on
 * the next cold launch. Nothing here needs to be live-reactive.
 *
 * Callers should prefer *not* setting `lineHeight` at all for body copy, and
 * rely on the platform default, which already scales. This exists for the
 * display sizes where the intended leading is a design decision.
 */
export const scaledLine = (size: number, factor = 1.45): number =>
  Math.round(size * factor * PixelRatio.getFontScale());

/**
 * Elevation is theme-dependent on purpose.
 *
 * On a near-black background a drop shadow is invisible, so `dark` zeroes the
 * opacity and `elevation` and depth is conveyed by the `surface` / `border`
 * step instead. Shadowing a dark surface produces a smudge, not depth.
 */
export const lightElevation = {
  none: {},
  sm: {
    shadowColor: '#1C1A26',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#1C1A26',
    shadowOpacity: 0.07,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  lg: {
    shadowColor: '#1C1A26',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

const noShadow = {
  shadowColor: 'transparent',
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  elevation: 0,
} as const;

export const darkElevation = {
  none: noShadow,
  sm: noShadow,
  md: noShadow,
  lg: noShadow,
} as const;

export const getElevation = (mode: ThemeMode) =>
  mode === 'dark' ? darkElevation : lightElevation;

/**
 * Tabular figures for every hour value.
 *
 * Hour strings are decimal ("291.50"), and proportional digits make a column
 * of them jitter as values change. Android and iOS both honour
 * `fontVariant: ['tabular-nums']`; without it, the Records list visibly shifts
 * on every refresh.
 */
export const NUMERIC: { fontVariant: ['tabular-nums'] } = { fontVariant: ['tabular-nums'] };

// Design tokens (roadmap G1.1). Colors come from spec section 2.13 plus the choices made in
// G1.1: Classic status colors, Gold PR highlight, Sky blue charts, one-blue comparison shades.
// Contrast ratios in comments are WCAG, measured against the surface named.

import type { TextStyle } from 'react-native';

export type ColorScheme = 'light' | 'dark';

export type ThemeColors = {
  // Brand
  /** Baby-blue accent: primary buttons, active tab, selected controls. Too pale for text on light surfaces. */
  accent: string;
  /** Text and icons placed on an accent fill. */
  onAccent: string;
  /** Accent-colored text, links, and icons on the theme's surfaces. */
  accentText: string;
  /** Tinted background for selected rows and accent chips. */
  accentSubtle: string;

  // Surfaces
  background: string;
  card: string;
  /** Sheets, modals, and popovers that sit above cards. */
  cardElevated: string;
  /** Text fields and steppers placed on a card. */
  input: string;
  border: string;
  /** Dims content behind sheets and modals. */
  scrim: string;

  // Text
  text: string;
  textSecondary: string;
  /** Placeholders and hints only (about 3:1); never for content people need to read. */
  textTertiary: string;

  // Persistent dark chrome (header and tab bar are dark in both themes)
  chrome: string;
  onChrome: string;
  chromeInactive: string;
  chromeBorder: string;

  // Status: always paired with an icon and a label, never color alone.
  // `*Fill` is for icons, badges, and fills; `*Text` is for text on the theme's surfaces.
  successFill: string;
  successText: string;
  /** Amber is faint on white (1.8:1), so on light surfaces put a dark glyph inside it or use warningText. */
  warningFill: string;
  warningText: string;
  errorFill: string;
  errorText: string;
  /** Destructive buttons, e.g. Delete account. White text on it is 4.8:1. */
  destructive: string;
  onDestructive: string;

  // Personal records
  pr: string;
  onPr: string;

  // Charts (validated with the dataviz palette checks against `card`)
  chartPrimary: string;
  chartGrid: string;
  /** Form-report comparisons, newest first. One hue; strength shows recency. */
  chartCompare: readonly [newest: string, previous: string, oldest: string];
  /** Multi-series charts. Assign in order, never cycle; fold past 8 into "Other". */
  chartSeries: readonly string[];
};

const brand = {
  accent: '#89CFF0',
  onAccent: '#0B1520',
  chrome: '#0B0F14',
  onChrome: '#FFFFFF',
  chromeInactive: '#8A94A0', // 6.3:1 on chrome
  pr: '#F5B400',
  onPr: '#0B1520', // 10.0:1 on pr
  destructive: '#D03B3B',
  onDestructive: '#FFFFFF',
} as const;

export const colors: Record<ColorScheme, ThemeColors> = {
  light: {
    ...brand,
    accentText: '#1A6FA3', // 5.5:1 on card, 5.0:1 on background
    accentSubtle: '#EAF6FC',
    background: '#F2F4F7',
    card: '#FFFFFF',
    cardElevated: '#FFFFFF',
    input: '#F2F4F7',
    border: '#E4E7EC',
    scrim: 'rgba(11, 15, 20, 0.45)',
    text: '#0B0F14', // 19.2:1 on card
    textSecondary: '#5B6470', // 6.0:1 on card
    textTertiary: '#8A94A0', // 3.1:1 on card
    chromeBorder: '#0B0F14',
    successFill: '#0CA30C',
    successText: '#006300', // 7.5:1 on card
    warningFill: '#FAB219',
    warningText: '#8A5A00', // 5.9:1 on card
    errorFill: '#D03B3B',
    errorText: '#B02A2A', // 6.5:1 on card
    chartPrimary: '#1E86C1', // 4.0:1 on card
    chartGrid: '#E4E7EC',
    chartCompare: ['#155E8C', '#1E86C1', '#72B3DC'],
    chartSeries: ['#1E86C1', '#EB6834', '#1BAF7A', '#EDA100', '#E87BA4', '#008300', '#6250D6', '#E34948'],
  },
  dark: {
    ...brand,
    accentText: '#89CFF0', // 10.2:1 on card
    accentSubtle: '#293740',
    background: '#0B0D10',
    card: '#171A1F',
    cardElevated: '#1E2228',
    input: '#22262D',
    border: '#262B33',
    scrim: 'rgba(0, 0, 0, 0.6)',
    text: '#F5F7FA', // 16.3:1 on card
    textSecondary: '#9AA4AF', // 6.9:1 on card
    textTertiary: '#6B7480', // 3.7:1 on card
    chromeBorder: '#262B33',
    successFill: '#0CA30C',
    successText: '#0CA30C', // 5.2:1 on card
    warningFill: '#FAB219',
    warningText: '#FAB219', // 9.5:1 on card
    errorFill: '#E66767',
    errorText: '#E66767', // 5.4:1 on card
    chartPrimary: '#3A9AD6', // 5.6:1 on card
    chartGrid: '#262B33',
    chartCompare: ['#89CFF0', '#3A9AD6', '#1A6FA3'],
    chartSeries: ['#3A9AD6', '#D95926', '#199E70', '#C98500', '#D55181', '#008300', '#9085E9', '#E66767'],
  },
};

/** 4-point spacing scale. Screen side gutter is `lg`. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  /** Set-number badges, small chips. */
  sm: 8,
  /** Inputs, steppers, rows inside cards. */
  md: 12,
  /** Cards and sheets. */
  card: 16,
  pill: 999,
} as const;

/**
 * Type scale on SF Pro, matching iOS text-style sizes at the default Dynamic Type setting.
 * React Native scales these with the user's text size automatically. Headings run heavier
 * than iOS defaults for the athletic look.
 */
export const typography = {
  /** Big numbers: rest timer, hero weight. */
  display: { fontSize: 40, lineHeight: 44, fontWeight: '800', fontVariant: ['tabular-nums'] },
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '800' },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  /** Uppercase section labels. */
  label: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

/** Add to any style showing numbers that line up in columns (set tables, timers). */
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };

/** Light theme lifts cards with a soft shadow; dark theme relies on surface color and borders. */
export const elevation: Record<ColorScheme, { card: string | undefined; sheet: string }> = {
  light: {
    card: '0px 1px 3px rgba(11, 15, 20, 0.06), 0px 4px 12px rgba(11, 15, 20, 0.04)',
    sheet: '0px -4px 24px rgba(11, 15, 20, 0.12)',
  },
  dark: {
    card: undefined,
    sheet: '0px -4px 24px rgba(0, 0, 0, 0.5)',
  },
};

export const opacity = {
  disabled: 0.4,
  pressed: 0.7,
} as const;

/** Durations in ms. Skip non-essential motion when the user has Reduce Motion on. */
export const motion = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;
